import { isAbsolute, resolve } from 'path';
import { getGitHubHost, isGitHubHost } from './github-host.ts';
import type { ParsedSource } from './types.ts';

const SOURCE_ALIASES: Record<string, string> = {
  'coinbase/agentWallet': 'coinbase/agentic-wallet-skills',
  'vercel-labs/vercel-skills': 'vercel-labs/agent-skills',
};

export function getOwnerRepo(parsed: ParsedSource): string | null {
  if (parsed.type === 'local' || parsed.type === 'download') {
    return null;
  }

  const sshMatch = parsed.url.match(/^git@[^:]+:(.+)$/);
  if (sshMatch) {
    let path = sshMatch[1]!;
    path = path.replace(/\.git$/, '');
    if (path.includes('/')) {
      return path;
    }
    return null;
  }

  // Handle SSH URLs with a scheme (e.g., ssh://git@host:7999/owner/repo.git)
  if (parsed.url.startsWith('ssh://')) {
    try {
      const url = new URL(parsed.url);
      let path = url.pathname.slice(1);
      path = path.replace(/\.git$/, '');

      if (path.includes('/')) {
        return path;
      }
      return null;
    } catch {
      return null;
    }
  }

  if (!parsed.url.startsWith('http://') && !parsed.url.startsWith('https://')) {
    return null;
  }

  try {
    const url = new URL(parsed.url);
    let path = url.pathname.slice(1);
    path = path.replace(/\.git$/, '');
    if (path.includes('/')) {
      return path;
    }
  } catch {
    // Invalid URL
  }

  return null;
}

export function parseOwnerRepo(ownerRepo: string): { owner: string; repo: string } | null {
  const match = ownerRepo.match(/^([^/]+)\/([^/]+)$/);
  if (match) {
    return { owner: match[1]!, repo: match[2]! };
  }
  return null;
}

function sanitizeSubpath(subpath: string): string {
  const normalized = subpath.replace(/\\/g, '/');
  const segments = normalized.split('/');
  for (const segment of segments) {
    if (segment === '..') {
      throw new Error(
        `Unsafe subpath: "${subpath}" contains path traversal segments. ` +
          `Subpaths must not contain ".." components.`
      );
    }
  }
  return subpath;
}

function isLocalPath(input: string): boolean {
  return (
    isAbsolute(input) ||
    input.startsWith('./') ||
    input.startsWith('../') ||
    input === '.' ||
    input === '..' ||
    /^[a-zA-Z]:[/\\]/.test(input)
  );
}

function isWellKnownUrl(input: string): boolean {
  if (!input.startsWith('http://') && !input.startsWith('https://')) {
    return false;
  }

  try {
    const parsed = new URL(input);
    const excludedHosts = ['github.com', 'gitlab.com', 'raw.githubusercontent.com'];
    if (excludedHosts.includes(parsed.hostname)) {
      return false;
    }
    if (input.endsWith('.git')) {
      return false;
    }
    return true;
  } catch {
    return false;
  }
}

interface FragmentRefResult {
  inputWithoutFragment: string;
  ref?: string;
  skillFilter?: string;
}

function decodeFragmentValue(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function looksLikeGitSource(input: string): boolean {
  if (input.startsWith('github:') || input.startsWith('gitlab:') || input.startsWith('git@')) {
    return true;
  }

  if (/^ssh:\/\/.+\.git(?:$|[/?])/i.test(input)) {
    return true;
  }

  if (input.startsWith('http://') || input.startsWith('https://')) {
    try {
      const parsed = new URL(input);
      const pathname = parsed.pathname;

      if (isGitHubHost(parsed.host)) {
        return /^\/[^/]+\/[^/]+(?:\.git)?(?:\/tree\/[^/]+(?:\/.*)?)?\/?$/.test(pathname);
      }

      if (parsed.hostname === 'gitlab.com') {
        return /^\/.+?\/[^/]+(?:\.git)?(?:\/-\/tree\/[^/]+(?:\/.*)?)?\/?$/.test(pathname);
      }
    } catch {
      // Fall through
    }
  }

  if (/^https?:\/\/.+\.git(?:$|[/?])/i.test(input)) {
    return true;
  }

  return (
    !input.includes(':') &&
    !input.startsWith('.') &&
    !input.startsWith('/') &&
    /^([^/]+)\/([^/]+)(?:\/(.+)|@(.+))?$/.test(input)
  );
}

function parseFragmentRef(input: string): FragmentRefResult {
  const hashIndex = input.indexOf('#');
  if (hashIndex < 0) {
    return { inputWithoutFragment: input };
  }

  const inputWithoutFragment = input.slice(0, hashIndex);
  const fragment = input.slice(hashIndex + 1);

  if (!fragment || !looksLikeGitSource(inputWithoutFragment)) {
    return { inputWithoutFragment: input };
  }

  const atIndex = fragment.indexOf('@');
  if (atIndex === -1) {
    return {
      inputWithoutFragment,
      ref: decodeFragmentValue(fragment),
    };
  }

  const ref = fragment.slice(0, atIndex);
  const skillFilter = fragment.slice(atIndex + 1);
  return {
    inputWithoutFragment,
    ref: ref ? decodeFragmentValue(ref) : undefined,
    skillFilter: skillFilter ? decodeFragmentValue(skillFilter) : undefined,
  };
}

function appendFragmentRef(input: string, ref?: string, skillFilter?: string): string {
  if (!ref) {
    return input;
  }
  return `${input}#${ref}${skillFilter ? `@${skillFilter}` : ''}`;
}

function isHostedArtifactUrl(input: string): boolean {
  try {
    const parsed = new URL(input);
    const host = parsed.hostname.toLowerCase();

    if (
      host === 'raw.githubusercontent.com' ||
      host === 'codeload.github.com' ||
      host === 'objects.githubusercontent.com'
    ) {
      return true;
    }

    if (host === 'github.com') {
      return /^\/[^/]+\/[^/]+\/(?:archive\/|raw\/|releases\/(?:download\/|latest\/download\/))/.test(
        parsed.pathname
      );
    }

    if (host === 'gitlab.com') {
      return /\/-\/(?:archive|raw)\//.test(parsed.pathname);
    }

    return false;
  } catch {
    return false;
  }
}

export function parseSource(input: string): ParsedSource {
  // Local path: absolute, relative, or current directory
  if (isLocalPath(input)) {
    const resolvedPath = resolve(input);
    return {
      type: 'local',
      url: resolvedPath,
      localPath: resolvedPath,
    };
  }

  const {
    inputWithoutFragment,
    ref: fragmentRef,
    skillFilter: fragmentSkillFilter,
  } = parseFragmentRef(input);
  input = inputWithoutFragment;

  // Resolve source aliases before parsing
  const alias = SOURCE_ALIASES[input];
  if (alias) {
    input = alias;
  }

  // Prefix shorthand: github:owner/repo
  const githubPrefixMatch = input.match(/^github:(.+)$/);
  if (githubPrefixMatch) {
    return parseSource(appendFragmentRef(githubPrefixMatch[1]!, fragmentRef, fragmentSkillFilter));
  }

  // Prefix shorthand: gitlab:owner/repo -> https://gitlab.com/owner/repo
  const gitlabPrefixMatch = input.match(/^gitlab:(.+)$/);
  if (gitlabPrefixMatch) {
    return parseSource(
      appendFragmentRef(
        `https://gitlab.com/${gitlabPrefixMatch[1]!}`,
        fragmentRef,
        fragmentSkillFilter
      )
    );
  }

  // Hosted raw files and archive/release assets must be downloaded directly
  if (isHostedArtifactUrl(input)) {
    return {
      type: 'download',
      url: input,
    };
  }

  // GitHub URLs
  const githubTreeWithPathMatch = input.match(/github\.com\/([^/]+)\/([^/]+)\/tree\/([^/]+)\/(.+)/);
  if (githubTreeWithPathMatch) {
    const [, owner, repo, ref, subpath] = githubTreeWithPathMatch;
    return {
      type: 'github',
      url: `https://github.com/${owner}/${repo}.git`,
      ref: ref || fragmentRef,
      subpath: subpath ? sanitizeSubpath(subpath) : subpath,
    };
  }

  const githubTreeMatch = input.match(/github\.com\/([^/]+)\/([^/]+)\/tree\/([^/]+)$/);
  if (githubTreeMatch) {
    const [, owner, repo, ref] = githubTreeMatch;
    return {
      type: 'github',
      url: `https://github.com/${owner}/${repo}.git`,
      ref: ref || fragmentRef,
    };
  }

  const githubRepoMatch = input.match(/github\.com\/([^/]+)\/([^/]+)/);
  if (githubRepoMatch) {
    const [, owner, repo] = githubRepoMatch;
    const cleanRepo = repo!.replace(/\.git$/, '');
    return {
      type: 'github',
      url: `https://github.com/${owner}/${cleanRepo}.git`,
      ...(fragmentRef ? { ref: fragmentRef } : {}),
    };
  }

  // GitLab URLs
  const gitlabTreeWithPathMatch = input.match(
    /^(https?):\/\/([^/]+)\/(.+?)\/-\/tree\/([^/]+)\/(.+)/
  );
  if (gitlabTreeWithPathMatch) {
    const [, protocol, hostname, repoPath, ref, subpath] = gitlabTreeWithPathMatch;
    if (hostname !== 'github.com' && repoPath) {
      return {
        type: 'gitlab',
        url: `${protocol}://${hostname}/${repoPath.replace(/\.git$/, '')}.git`,
        ref: ref || fragmentRef,
        subpath: subpath ? sanitizeSubpath(subpath) : subpath,
      };
    }
  }

  const gitlabTreeMatch = input.match(/^(https?):\/\/([^/]+)\/(.+?)\/-\/tree\/([^/]+)$/);
  if (gitlabTreeMatch) {
    const [, protocol, hostname, repoPath, ref] = gitlabTreeMatch;
    if (hostname !== 'github.com' && repoPath) {
      return {
        type: 'gitlab',
        url: `${protocol}://${hostname}/${repoPath.replace(/\.git$/, '')}.git`,
        ref: ref || fragmentRef,
      };
    }
  }

  const gitlabRepoMatch = input.match(/gitlab\.com\/(.+?)(?:\.git)?\/?$/);
  if (gitlabRepoMatch) {
    const repoPath = gitlabRepoMatch[1]!;
    if (repoPath.includes('/')) {
      return {
        type: 'gitlab',
        url: `https://gitlab.com/${repoPath}.git`,
        ...(fragmentRef ? { ref: fragmentRef } : {}),
      };
    }
  }

  // GitHub shorthand: owner/repo, owner/repo/path, or owner/repo@skill
  const githubHost = getGitHubHost();
  const shorthandSourceType = githubHost === 'github.com' ? 'github' : 'git';

  const atSkillMatch = input.match(/^([^/]+)\/([^/@]+)@(.+)$/);
  if (atSkillMatch && !input.includes(':') && !input.startsWith('.') && !input.startsWith('/')) {
    const [, owner, repo, skillFilter] = atSkillMatch;
    return {
      type: shorthandSourceType,
      url: `https://${githubHost}/${owner}/${repo}.git`,
      ...(fragmentRef ? { ref: fragmentRef } : {}),
      skillFilter: fragmentSkillFilter || skillFilter,
    };
  }

  const shorthandMatch = input.match(/^([^/]+)\/([^/]+)(?:\/(.+))?$/);
  if (shorthandMatch && !input.includes(':') && !input.startsWith('.') && !input.startsWith('/')) {
    const [, owner, repo, subpath] = shorthandMatch;
    return {
      type: shorthandSourceType,
      url: `https://${githubHost}/${owner}/${repo}.git`,
      ...(fragmentRef ? { ref: fragmentRef } : {}),
      subpath: subpath ? sanitizeSubpath(subpath) : subpath,
      ...(fragmentSkillFilter ? { skillFilter: fragmentSkillFilter } : {}),
    };
  }

  // Well-known URLs
  if (isWellKnownUrl(input)) {
    return {
      type: 'well-known',
      url: input,
    };
  }

  // Fallback: direct git URL
  return {
    type: 'git',
    url: input,
    ...(fragmentRef ? { ref: fragmentRef } : {}),
  };
}

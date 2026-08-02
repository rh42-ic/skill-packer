import { readFile } from 'fs/promises';
import { join, dirname, resolve, normalize, sep } from 'path';

/**
 * Check if a path is contained within a base directory.
 * Prevents path traversal attacks via `..` segments or absolute paths.
 */
export function isContainedIn(targetPath: string, basePath: string): boolean {
  const normalizedBase = normalize(resolve(basePath));
  const normalizedTarget = normalize(resolve(targetPath));
  return normalizedTarget.startsWith(normalizedBase + sep) || normalizedTarget === normalizedBase;
}

/**
 * Validate that a relative path follows Claude Code conventions.
 * Paths must start with './' per the plugin manifest spec.
 */
function isValidRelativePath(path: string): boolean {
  return path.startsWith('./');
}

interface PluginManifestEntry {
  source?: string | { source: string; repo?: string };
  skills?: string[];
  name?: string;
}

interface MarketplaceManifest {
  metadata?: { pluginRoot?: string };
  plugins?: PluginManifestEntry[];
}

interface PluginManifest {
  skills?: string[];
  name?: string;
}

/**
 * Extract skill search directories from plugin manifests.
 * Handles both marketplace.json (multi-plugin) and plugin.json (single plugin).
 * Only resolves local paths - remote sources are skipped.
 */
export async function getPluginSkillPaths(basePath: string): Promise<string[]> {
  const searchDirs: string[] = [];

  const addPluginSkillPaths = (pluginBase: string, skills?: string[]) => {
    if (!isContainedIn(pluginBase, basePath)) return;

    if (skills && skills.length > 0) {
      for (const skillPath of skills) {
        if (!isValidRelativePath(skillPath)) continue;

        const skillDir = dirname(join(pluginBase, skillPath));
        if (isContainedIn(skillDir, basePath)) {
          searchDirs.push(skillDir);
        }
      }
    }
    searchDirs.push(join(pluginBase, 'skills'));
  };

  // Try marketplace.json (multi-plugin catalog)
  try {
    const content = await readFile(join(basePath, '.claude-plugin/marketplace.json'), 'utf-8');
    const manifest: MarketplaceManifest = JSON.parse(content);
    const pluginRoot = manifest.metadata?.pluginRoot;
    const validPluginRoot = pluginRoot === undefined || isValidRelativePath(pluginRoot);

    if (validPluginRoot) {
      for (const plugin of manifest.plugins ?? []) {
        if (typeof plugin.source !== 'string' && plugin.source !== undefined) continue;
        if (plugin.source !== undefined && !isValidRelativePath(plugin.source)) continue;

        const pluginBase = join(basePath, pluginRoot ?? '', plugin.source ?? '');
        addPluginSkillPaths(pluginBase, plugin.skills);
      }
    }
  } catch {
    // File doesn't exist or invalid JSON
  }

  // Try plugin.json (single plugin at root)
  try {
    const content = await readFile(join(basePath, '.claude-plugin/plugin.json'), 'utf-8');
    const manifest: PluginManifest = JSON.parse(content);
    addPluginSkillPaths(basePath, manifest.skills);
  } catch {
    // File doesn't exist or invalid JSON
  }

  return searchDirs;
}

/**
 * Get a map of skill directory paths to plugin names from plugin manifests.
 * This allows grouping skills by their parent plugin.
 *
 * Returns Map<AbsolutePath, PluginName>
 */
export async function getPluginGroupings(basePath: string): Promise<Map<string, string>> {
  const groupings = new Map<string, string>();

  // Try marketplace.json
  try {
    const content = await readFile(join(basePath, '.claude-plugin/marketplace.json'), 'utf-8');
    const manifest: MarketplaceManifest = JSON.parse(content);
    const pluginRoot = manifest.metadata?.pluginRoot;
    const validPluginRoot = pluginRoot === undefined || isValidRelativePath(pluginRoot);

    if (validPluginRoot) {
      for (const plugin of manifest.plugins ?? []) {
        if (!plugin.name) continue;
        if (typeof plugin.source !== 'string' && plugin.source !== undefined) continue;
        if (plugin.source !== undefined && !isValidRelativePath(plugin.source)) continue;

        const pluginBase = join(basePath, pluginRoot ?? '', plugin.source ?? '');

        if (!isContainedIn(pluginBase, basePath)) continue;

        if (plugin.skills && plugin.skills.length > 0) {
          for (const skillPath of plugin.skills) {
            if (!isValidRelativePath(skillPath)) continue;

            const skillDir = dirname(join(pluginBase, skillPath));
            if (isContainedIn(skillDir, basePath)) {
              groupings.set(resolve(skillDir), plugin.name);
            }
          }
        }
      }
    }
  } catch {
    // File doesn't exist or invalid JSON
  }

  // Try plugin.json (single plugin at root)
  try {
    const content = await readFile(join(basePath, '.claude-plugin/plugin.json'), 'utf-8');
    const manifest: PluginManifest = JSON.parse(content);
    if (manifest.name && manifest.skills && manifest.skills.length > 0) {
      for (const skillPath of manifest.skills) {
        if (!isValidRelativePath(skillPath)) continue;
        const skillDir = dirname(join(basePath, skillPath));
        if (isContainedIn(skillDir, basePath)) {
          groupings.set(resolve(skillDir), manifest.name);
        }
      }
    }
  } catch {
    // File doesn't exist or invalid JSON
  }

  return groupings;
}

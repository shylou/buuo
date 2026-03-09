/**
 * Skill Plugin SDK - Utilities for creating skill plugins
 */

import type { SkillPlugin, SkillDefinition, SkillContext, PluginContext, JSONSchema } from '@buuo/core/plugins';

export interface SkillPluginOptions {
  id: string;
  name: string;
  version: string;
  description: string;
  author?: string;
  skills: SkillDefinition[];
}

export function createSkillPlugin(options: SkillPluginOptions): SkillPlugin {
  let context: PluginContext | null = null;

  return {
    id: options.id,
    name: options.name,
    version: options.version,
    description: options.description,
    type: 'skill',
    author: options.author,

    async initialize(ctx: PluginContext): Promise<void> {
      context = ctx;
      ctx.logger.info(`Skill plugin "${options.id}" initialized with ${options.skills.length} skills`);
    },

    async start(): Promise<void> {
      context?.logger.info(`Skill plugin "${options.id}" started`);
    },

    async stop(): Promise<void> {
      context?.logger.info(`Skill plugin "${options.id}" stopped`);
    },

    skills: options.skills,

    async executeSkill(skillId: string, input: unknown): Promise<unknown> {
      const skill = options.skills.find(s => s.id === skillId);
      if (!skill) {
        throw new Error(`Skill not found: ${skillId}`);
      }

      const skillContext: SkillContext = {
        userId: (input as any)?.userId ?? 'unknown',
        conversationId: (input as any)?.conversationId ?? 'unknown',
        channelId: (input as any)?.channelId ?? 'unknown',
        session: (input as any)?.session ?? {}
      };

      return await skill.handler(input, skillContext);
    }
  };
}

export interface SkillOptions {
  id: string;
  name: string;
  description: string;
  inputSchema: JSONSchema;
  handler: (input: unknown, context: SkillContext) => Promise<unknown>;
}

export function createSkill(options: SkillOptions): SkillDefinition {
  return {
    id: options.id,
    name: options.name,
    description: options.description,
    inputSchema: options.inputSchema,
    handler: options.handler
  };
}

/**
 * Helper to create a simple skill with typed input
 */
export function createTypedSkill<TInput = any, TOutput = any>(options: {
  id: string;
  name: string;
  description: string;
  inputSchema: JSONSchema;
  handler: (input: TInput, context: SkillContext) => Promise<TOutput>;
}): SkillDefinition {
  return {
    id: options.id,
    name: options.name,
    description: options.description,
    inputSchema: options.inputSchema,
    handler: options.handler as (input: unknown, context: SkillContext) => Promise<unknown>
  };
}

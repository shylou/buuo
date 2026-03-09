# Provider API Documentation

Buuo provider system supports multiple AI models with unified conversational interface.

---

## Provider Interface

### `AIProvider`

Base interface that all providers must implement.

```typescript
interface AIProvider {
  /** Provider ID */
  id: string;

  /** Provider name */
  name: string;

  /** Initialize provider */
  initialize(config: ProviderConfig): Promise<void>;

  /** Send chat request */
  chat(request: ChatRequest): Promise<ChatResponse>;

  /** Stream chat */
  chatStream(request: ChatRequest): AsyncIterable<ChatResponse>;

  /** Estimate token count */
  estimateTokens(text: string): number;
}
```

---

## Request and Response

### `ChatRequest`

Chat request structure:

```typescript
interface ChatRequest {
  /** Session ID */
  sessionId: string;

  /** Message history */
  messages: ChatMessage[];

  /** System prompt */
  systemPrompt?: string;

  /** Temperature parameter (0-1) */
  temperature?: number;

  /** Max tokens */
  maxTokens?: number;

  /** Tool definitions */
  tools?: ToolDefinition[];
}
```

### `ChatMessage`

```typescript
interface ChatMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  toolCalls?: ToolCall[];
  toolId?: string;
}
```

### `ChatResponse`

```typescript
interface ChatResponse {
  /** Content */
  content?: string;

  /** Tool calls */
  toolCalls?: ToolCall[];

  /** Usage statistics */
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };

  /** Is done */
  done: boolean;
}
```

---

## Built-in Provider

### Claude Code Provider

Uses local Claude Code CLI:

```typescript
import { ClaudeCodeProvider } from '@buuo/provider-claude-code';

const provider = new ClaudeCodeProvider({
  id: 'claude-code-local'
});

await provider.initialize({
  workingDirectory: '/root/opendev/buuo',
  enableTools: true
});

// Stream chat
for await (const response of provider.chatStream(request)) {
  if (response.content) {
    process.stdout.write(response.content);
  }
  if (response.done) {
    console.log('\n[Done]');
  }
}
```

---

## Provider Configuration

### `ProviderConfig`

```typescript
interface ProviderConfig {
  /** Working directory */
  workingDirectory?: string;

  /** Enable tool access */
  enableTools?: boolean;

  /** Session timeout (ms) */
  sessionTimeout?: number;

  /** Request timeout (ms) */
  requestTimeout?: number;
}
```

---

## Creating Custom Providers

```typescript
import type { AIProvider } from '@buuo/core';

export class MyProvider implements AIProvider {
  id = 'my-provider';
  name = 'My Custom AI Provider';

  async initialize(config: ProviderConfig): Promise<void> {
    // Initialize logic
  }

  async chat(request: ChatRequest): Promise<ChatResponse> {
    // Send request
    // Return response
    return {
      content: 'Hello!',
      done: true
    };
  }

  async *chatStream(request: ChatRequest): AsyncIterable<ChatResponse> {
    // Implement stream chat
    yield {
      content: 'Hello!',
      done: true
    };
  }

  estimateTokens(text: string): number {
    // Simple estimate: 4 chars ≈ 1 token
    return Math.ceil(text.length / 4);
  }
}
```

---

## Supported Models

### Claude Code CLI

Uses local installation with full tool access support.

---

## Related Documentation

- [Channels API](./channels.md)
- [Plugins API](./plugins.md)

// ─── Tool Registry ───────────────────────────────────────────────────────────
// Each tool exports { definition, handler }.
// definition = the MCP tool schema (name, description, inputSchema)
// handler(args, context) = returns MCP content array

const registry = new Map();

function register(name, definition, handler) {
  registry.set(name, { definition, handler });
}

export function listTools() {
  return [...registry.values()].map(t => t.definition);
}

export function callTool(name, args, context) {
  const tool = registry.get(name);
  if (!tool) throw new Error(`Unknown tool: ${name}`);
  return tool.handler(args, context);
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function text(str) {
  return { content: [{ type: 'text', text: str }] };
}

function json(obj) {
  return text(JSON.stringify(obj, null, 2));
}

function error(str) {
  return { content: [{ type: 'text', text: str }], isError: true };
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// 1x1 red PNG, 67 bytes
const TINY_PNG_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==';

// ─── Tools ───────────────────────────────────────────────────────────────────

// 1. echo — basic connectivity
register('echo', {
  name: 'echo',
  description: 'Echoes back the input message. Good for basic connectivity testing.',
  inputSchema: {
    type: 'object',
    properties: {
      message: { type: 'string', description: 'Message to echo' },
    },
    required: ['message'],
  },
}, (args) => text(`Echo: ${args.message}`));

// 2. add — numeric params and result
register('add', {
  name: 'add',
  description: 'Adds two numbers and returns the result.',
  inputSchema: {
    type: 'object',
    properties: {
      a: { type: 'number', description: 'First number' },
      b: { type: 'number', description: 'Second number' },
    },
    required: ['a', 'b'],
  },
}, (args) => json({ result: args.a + args.b }));

// 3. get_weather — optional params, structured JSON response
register('get_weather', {
  name: 'get_weather',
  description: 'Returns simulated weather data for a city. Tests optional params and structured responses.',
  inputSchema: {
    type: 'object',
    properties: {
      city: { type: 'string', description: 'City name' },
      units: { type: 'string', enum: ['celsius', 'fahrenheit'], description: 'Temperature units (default: celsius)' },
    },
    required: ['city'],
  },
}, (args) => {
  const isFahrenheit = args.units === 'fahrenheit';
  const tempC = Math.round(Math.random() * 35);
  const temp = isFahrenheit ? Math.round(tempC * 9 / 5 + 32) : tempC;
  const conditions = ['sunny', 'cloudy', 'rainy', 'snowy', 'windy', 'foggy'];
  return json({
    city: args.city,
    temperature: temp,
    units: isFahrenheit ? 'fahrenheit' : 'celsius',
    condition: conditions[Math.floor(Math.random() * conditions.length)],
    humidity: Math.round(Math.random() * 100),
    wind_speed_kmh: Math.round(Math.random() * 50),
  });
});

// 4. multi_content — multiple content blocks in one response
register('multi_content', {
  name: 'multi_content',
  description: 'Returns multiple content blocks (text + image). Tests multi-part content array handling.',
  inputSchema: { type: 'object', properties: {} },
}, () => ({
  content: [
    { type: 'text', text: 'Here is a 1x1 red pixel PNG:' },
    { type: 'image', data: TINY_PNG_BASE64, mimeType: 'image/png' },
    { type: 'text', text: 'End of multi-content response.' },
  ],
}));

// 5. no_params — empty input schema
register('no_params', {
  name: 'no_params',
  description: 'Takes zero arguments. Returns server timestamp. Tests empty inputSchema handling.',
  inputSchema: { type: 'object', properties: {} },
}, () => json({ timestamp: new Date().toISOString(), message: 'No parameters were needed.' }));

// 6. complex_input — nested objects, arrays, enums
register('complex_input', {
  name: 'complex_input',
  description: 'Accepts nested objects, arrays, and enums. Stress-tests client schema validation.',
  inputSchema: {
    type: 'object',
    properties: {
      user: {
        type: 'object',
        description: 'A nested user object',
        properties: {
          name: { type: 'string' },
          age: { type: 'integer' },
          role: { type: 'string', enum: ['admin', 'editor', 'viewer'] },
        },
        required: ['name'],
      },
      tags: {
        type: 'array',
        items: { type: 'string' },
        description: 'A list of string tags',
      },
      priority: {
        type: 'string',
        enum: ['low', 'medium', 'high', 'critical'],
        description: 'Priority level',
      },
      metadata: {
        type: 'object',
        description: 'Arbitrary key-value metadata',
        additionalProperties: { type: 'string' },
      },
    },
    required: ['user', 'priority'],
  },
}, (args) => json({ received: args, valid: true }));

// 7. optional_only — all optional params with defaults
register('optional_only', {
  name: 'optional_only',
  description: 'All parameters are optional with defaults. Tests client behavior when user provides nothing.',
  inputSchema: {
    type: 'object',
    properties: {
      greeting: { type: 'string', description: 'Greeting text (default: "Hello")' },
      count: { type: 'integer', description: 'Repeat count (default: 1)' },
      uppercase: { type: 'boolean', description: 'Uppercase output (default: false)' },
    },
  },
}, (args) => {
  const greeting = args.greeting || 'Hello';
  const count = args.count || 1;
  const uppercase = args.uppercase || false;
  const result = Array(count).fill(greeting).join(' ');
  return text(uppercase ? result.toUpperCase() : result);
});

// 8. always_fails — error response
register('always_fails', {
  name: 'always_fails',
  description: 'Always returns an error. Tests client error handling for tool failures.',
  inputSchema: {
    type: 'object',
    properties: {
      error_message: { type: 'string', description: 'Custom error message (default: "This tool always fails")' },
    },
  },
}, (args) => error(args.error_message || 'This tool always fails'));

// 9. slow_tool — configurable delay
register('slow_tool', {
  name: 'slow_tool',
  description: 'Waits for the specified duration before responding. Tests client timeout handling.',
  inputSchema: {
    type: 'object',
    properties: {
      delay_ms: { type: 'integer', description: 'Delay in milliseconds (default: 3000, max: 30000)' },
    },
  },
}, async (args) => {
  const delay = Math.min(args.delay_ms || 3000, 30000);
  const start = Date.now();
  await sleep(delay);
  return json({ requested_delay_ms: delay, actual_delay_ms: Date.now() - start });
});

// 10. return_image — image content type
register('return_image', {
  name: 'return_image',
  description: 'Returns a base64-encoded PNG image. Tests image content type support.',
  inputSchema: { type: 'object', properties: {} },
}, () => ({
  content: [{ type: 'image', data: TINY_PNG_BASE64, mimeType: 'image/png' }],
}));

// 11. return_embedded_resource — resource content type in tool results
register('return_embedded_resource', {
  name: 'return_embedded_resource',
  description: 'Returns an embedded resource content block. Tests the resource content type in tool results.',
  inputSchema: {
    type: 'object',
    properties: {
      uri: { type: 'string', description: 'Resource URI (default: "test://embedded/example")' },
    },
  },
}, (args) => ({
  content: [{
    type: 'resource',
    resource: {
      uri: args.uri || 'test://embedded/example',
      mimeType: 'application/json',
      text: JSON.stringify({ embedded: true, timestamp: new Date().toISOString() }),
    },
  }],
}));

// 12. counter — per-session stateful tool
const counters = new Map();
register('counter', {
  name: 'counter',
  description: 'Increments and returns a per-session counter. Tests session state across multiple calls.',
  inputSchema: {
    type: 'object',
    properties: {
      action: { type: 'string', enum: ['increment', 'decrement', 'reset', 'get'], description: 'Counter action (default: increment)' },
    },
  },
}, (args, context) => {
  const sessionId = context?.sessionId || 'default';
  const action = args.action || 'increment';
  let count = counters.get(sessionId) || 0;
  if (action === 'increment') count++;
  else if (action === 'decrement') count--;
  else if (action === 'reset') count = 0;
  counters.set(sessionId, count);
  return json({ session: sessionId, count, action });
});

// 13. store_and_retrieve — key/value state across tool calls
const kvStore = new Map();
register('store_and_retrieve', {
  name: 'store_and_retrieve',
  description: 'Stores or retrieves key/value pairs. Tests multi-tool workflows and state persistence.',
  inputSchema: {
    type: 'object',
    properties: {
      action: { type: 'string', enum: ['store', 'retrieve', 'delete', 'list'], description: 'Action to perform' },
      key: { type: 'string', description: 'Key name (required for store/retrieve/delete)' },
      value: { type: 'string', description: 'Value to store (required for store action)' },
    },
    required: ['action'],
  },
}, (args, context) => {
  const sessionId = context?.sessionId || 'default';
  const ns = `${sessionId}:`;
  const { action, key, value } = args;

  if (action === 'store') {
    if (!key) return error('key is required for store action');
    kvStore.set(ns + key, value);
    return json({ stored: true, key, value });
  }
  if (action === 'retrieve') {
    if (!key) return error('key is required for retrieve action');
    const v = kvStore.get(ns + key);
    if (v === undefined) return error(`Key not found: ${key}`);
    return json({ key, value: v });
  }
  if (action === 'delete') {
    if (!key) return error('key is required for delete action');
    const existed = kvStore.delete(ns + key);
    return json({ deleted: existed, key });
  }
  if (action === 'list') {
    const keys = [...kvStore.keys()].filter(k => k.startsWith(ns)).map(k => k.slice(ns.length));
    return json({ keys });
  }
  return error(`Unknown action: ${action}`);
});

// 14. progress_tool — sends progress notifications during execution
register('progress_tool', {
  name: 'progress_tool',
  description: 'Sends progress notifications during execution. Tests client handling of notifications/progress.',
  inputSchema: {
    type: 'object',
    properties: {
      steps: { type: 'integer', description: 'Number of progress steps (default: 5, max: 20)' },
      step_delay_ms: { type: 'integer', description: 'Delay between steps in ms (default: 500)' },
    },
  },
}, async (args, context) => {
  const steps = Math.min(args.steps || 5, 20);
  const stepDelay = Math.min(args.step_delay_ms || 500, 5000);
  const progressToken = context?.progressToken;

  for (let i = 1; i <= steps; i++) {
    if (progressToken !== undefined && context?.server) {
      try {
        await context.server.notification({
          method: 'notifications/progress',
          params: { progressToken, progress: i, total: steps, message: `Step ${i} of ${steps}` },
        });
      } catch { /* client may not support progress */ }
    }
    if (i < steps) await sleep(stepDelay);
  }

  return json({ completed: true, steps, step_delay_ms: stepDelay });
});

// 15. large_response — configurable payload size
register('large_response', {
  name: 'large_response',
  description: 'Returns a configurable amount of text. Tests client handling of large payloads.',
  inputSchema: {
    type: 'object',
    properties: {
      size_kb: { type: 'number', description: 'Approximate response size in KB (default: 10, max: 1024)' },
    },
  },
}, (args) => {
  const sizeKb = Math.min(args.size_kb || 10, 1024);
  const targetBytes = sizeKb * 1024;
  // Generate repeating line pattern
  const line = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789 ';
  const lineLen = line.length + 1; // +1 for newline
  const lines = Math.ceil(targetBytes / lineLen);
  const payload = Array(lines).fill(line).join('\n');
  return json({ size_kb: sizeKb, actual_bytes: payload.length, data: payload });
});

// 16. annotated_result — tests annotations on tool results
register('annotated_result', {
  name: 'annotated_result',
  description: 'Returns a result with MCP annotations (audience, priority). Tests client annotation handling.',
  inputSchema: {
    type: 'object',
    properties: {
      audience: {
        type: 'array',
        items: { type: 'string', enum: ['user', 'assistant'] },
        description: 'Who should see this result (default: both)',
      },
      priority: { type: 'number', description: 'Priority 0-1 (default: 0.5)' },
      message: { type: 'string', description: 'Message text (default: "Annotated result")' },
    },
  },
}, (args) => ({
  content: [{
    type: 'text',
    text: args.message || 'Annotated result',
    annotations: {
      audience: args.audience || ['user', 'assistant'],
      priority: args.priority ?? 0.5,
    },
  }],
}));

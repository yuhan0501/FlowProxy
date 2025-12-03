# FlowProxy

A desktop proxy tool with visual flow orchestration for intercepting and modifying HTTP/HTTPS traffic.

## Features

- **HTTP Proxy**: Local HTTP proxy server with request/response capturing
- **Request Viewer**: View recent requests with headers, body, and timing info
- **Copy as cURL/Raw**: One-click copy requests as cURL commands or raw HTTP format
- **Flow Editor**: Visual drag-and-drop flow editor using React Flow
- **Component System**: Built-in and custom script components for request/response modification
- **Component Debugger**: Test components with real request samples
- **HTTPS Support**: Certificate generation for HTTPS MITM (requires CA certificate installation)

## Tech Stack

- **Desktop Shell**: Electron
- **UI**: React + TypeScript + Ant Design
- **Flow Editor**: React Flow
- **Code Editor**: Monaco Editor
- **Proxy Engine**: Node.js HTTP/HTTPS modules
- **Certificate Generation**: node-forge

## Getting Started

### Prerequisites

- Node.js 18+
- npm

### Installation

```bash
npm install
```

### Development

```bash
# Build and run
npm start

# Or run in development mode
npm run dev
```

### Build

```bash
npm run build
```

## Usage

1. **Start the proxy**: Click "Start" in the header to start the proxy server (default port: 8888)

2. **Configure your system/browser** to use HTTP proxy at `127.0.0.1:8888`

3. **View requests**: Navigate to the "Requests" tab to see captured traffic

4. **Create flows**: Go to "Flows" tab to create request processing flows with visual editor

5. **Add components**: Use "Components" tab to manage and debug components

## Project Structure

```
src/
├── main/                    # Electron main process
│   ├── main.ts             # Entry point
│   ├── preload.ts          # Preload script for IPC
│   ├── proxy/              # Proxy engine
│   │   ├── proxyEngine.ts  # HTTP proxy server
│   │   └── certManager.ts  # HTTPS certificate management
│   ├── flow/               # Flow engine
│   │   └── flowEngine.ts   # Flow execution logic
│   ├── components/         # Component execution
│   │   ├── builtins.ts     # Built-in components
│   │   └── scriptRunner.ts # Script component sandbox
│   ├── store/              # Data stores
│   │   ├── requestStore.ts # Request record storage
│   │   ├── flowStore.ts    # Flow definitions
│   │   ├── componentStore.ts # Component definitions
│   │   └── configStore.ts  # App configuration
│   └── ipc/                # IPC handlers
│       └── handlers.ts
├── renderer/               # Electron renderer (React UI)
│   ├── App.tsx            # Main app component
│   ├── components/        # Shared components
│   │   ├── Header.tsx     # Top header with proxy controls
│   │   └── Sidebar.tsx    # Navigation sidebar
│   └── pages/             # Page components
│       ├── Dashboard.tsx  # Dashboard overview
│       ├── Requests.tsx   # Request list and detail
│       ├── Flows.tsx      # Flow list
│       ├── FlowEditor.tsx # Visual flow editor
│       ├── Components.tsx # Component management
│       └── Settings.tsx   # App settings
└── shared/                # Shared types
    └── models.ts          # Data models and interfaces
```

## Built-in Components

- **Header Rewrite**: Add, modify, or remove HTTP headers
- **Mock Response**: Return a mock response instead of forwarding
- **Delay**: Add a delay before continuing the flow

## Creating Custom Components

Custom components are JavaScript functions with access to the request context:

```javascript
function run(config, ctx) {
  // Access request
  ctx.log('Processing: ' + ctx.request.url);
  
  // Modify headers
  ctx.request.headers['x-custom'] = 'value';
  
  // Return modified request
  return { request: ctx.request };
  
  // Or return a mock response
  // return { 
  //   response: { 
  //     statusCode: 200, 
  //     body: '{"mock": true}' 
  //   }, 
  //   terminate: true 
  // };
}
```

## HTTPS Support

For HTTPS interception, install the CA certificate:

1. Start FlowProxy to generate the CA certificate
2. Find the certificate at `~/.flowproxy/certs/ca.crt` (or in app data directory)
3. Install and trust the certificate in your system keychain

## License

MIT

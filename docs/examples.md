---
title: Examples
description: Real-world diagram examples
order: 4
---

# Examples

## Live example library

[Browse all 16 examples](/examples) to preview a diagram, switch between light and dark, inspect its source, and download the JSON or Mermaid file.

| Family | Examples |
| --- | --- |
| Architecture | [Cache-aside](/examples/cache-aside), [background jobs](/examples/job-queue), [event fan-out](/examples/event-fanout), [retrieval](/examples/retrieval-pipeline), [edge delivery](/examples/edge-delivery), [webhook ingress](/examples/webhook-ingress), [delivery pipeline](/examples/delivery-pipeline), [regional failover](/examples/multi-region) |
| Native sequences | [Authorization code](/examples/oauth-code), [payment retries](/examples/payment-retry), [cache miss](/examples/cache-sequence), [webhook retries](/examples/webhook-retry) |
| Imported flowcharts | [Release decision](/examples/release-decision), [request routing](/examples/request-routing) |
| Imported state diagrams | [Order lifecycle](/examples/order-lifecycle), [circuit breaker](/examples/circuit-breaker) |

Architecture examples include animated packet routes. Sequences use the native message player. Flowcharts and state diagrams import Mermaid source into editable Arc nodes and connectors.

For a deeper interactive explanation, try the [connection pool](/examples/connection-pool): adjust demand and see borrowing, waiting, and reuse.

## Simple Three-Tier Architecture

```tsx
const simpleDiagram: ArcDiagramData = {
  layout: { width: 600, height: 300 },
  nodes: {
    frontend: { x: 50, y: 100, size: 'm' },
    backend: { x: 250, y: 100, size: 'm' },
    database: { x: 450, y: 100, size: 'm' },
  },
  nodeData: {
    frontend: { icon: 'Monitor', name: 'Frontend', color: 'violet' },
    backend: { icon: 'Server', name: 'Backend', color: 'emerald' },
    database: { icon: 'Database', name: 'Database', color: 'blue' },
  },
  connectors: [
    { from: 'frontend', to: 'backend', fromAnchor: 'right', toAnchor: 'left', style: 'api' },
    { from: 'backend', to: 'database', fromAnchor: 'right', toAnchor: 'left', style: 'db' },
  ],
  connectorStyles: {
    api: { color: 'violet', strokeWidth: 2, label: 'REST' },
    db: { color: 'blue', strokeWidth: 2, label: 'SQL' },
  },
}
```

## Microservices Architecture

```tsx
const microservicesArchitecture: ArcDiagramData = {
  layout: { width: 900, height: 500 },
  nodes: {
    client: { x: 50, y: 200, size: 'l' },
    gateway: { x: 200, y: 200, size: 'm' },
    auth: { x: 400, y: 50, size: 'm' },
    users: { x: 400, y: 200, size: 'm' },
    orders: { x: 400, y: 350, size: 'm' },
    cache: { x: 600, y: 50, size: 's' },
    userDb: { x: 600, y: 200, size: 's' },
    orderDb: { x: 600, y: 350, size: 's' },
    queue: { x: 750, y: 275, size: 'm' },
  },
  nodeData: {
    client: { icon: 'Smartphone', name: 'Mobile App', color: 'violet' },
    gateway: { icon: 'Network', name: 'API Gateway', color: 'emerald' },
    auth: { icon: 'Shield', name: 'Auth Service', color: 'amber' },
    users: { icon: 'Users', name: 'User Service', color: 'blue' },
    orders: { icon: 'ShoppingCart', name: 'Order Service', color: 'rose' },
    cache: { icon: 'Zap', name: 'Redis', subtitle: 'Cache', color: 'orange' },
    userDb: { icon: 'Database', name: 'PostgreSQL', subtitle: 'Users', color: 'blue' },
    orderDb: { icon: 'Database', name: 'PostgreSQL', subtitle: 'Orders', color: 'rose' },
    queue: { icon: 'MessageSquare', name: 'RabbitMQ', color: 'sky' },
  },
  connectors: [
    { from: 'client', to: 'gateway', fromAnchor: 'right', toAnchor: 'left', style: 'https' },
    { from: 'gateway', to: 'auth', fromAnchor: 'top', toAnchor: 'left', style: 'grpc' },
    { from: 'gateway', to: 'users', fromAnchor: 'right', toAnchor: 'left', style: 'grpc' },
    { from: 'gateway', to: 'orders', fromAnchor: 'bottom', toAnchor: 'left', style: 'grpc' },
    { from: 'auth', to: 'cache', fromAnchor: 'right', toAnchor: 'left', style: 'redis' },
    { from: 'users', to: 'userDb', fromAnchor: 'right', toAnchor: 'left', style: 'sql' },
    { from: 'orders', to: 'orderDb', fromAnchor: 'right', toAnchor: 'left', style: 'sql' },
    { from: 'orders', to: 'queue', fromAnchor: 'right', toAnchor: 'left', style: 'amqp' },
  ],
  connectorStyles: {
    https: { color: 'violet', strokeWidth: 2, label: 'HTTPS' },
    grpc: { color: 'emerald', strokeWidth: 2, label: 'gRPC' },
    sql: { color: 'blue', strokeWidth: 1, label: 'SQL' },
    redis: { color: 'orange', strokeWidth: 1, dashed: true },
    amqp: { color: 'sky', strokeWidth: 2, label: 'AMQP' },
  },
}
```

## Event-Driven Architecture

```tsx
const eventDriven: ArcDiagramData = {
  layout: { width: 700, height: 400 },
  nodes: {
    producer: { x: 50, y: 150, size: 'm' },
    broker: { x: 300, y: 150, size: 'l' },
    consumer1: { x: 550, y: 50, size: 'm' },
    consumer2: { x: 550, y: 150, size: 'm' },
    consumer3: { x: 550, y: 250, size: 'm' },
  },
  nodeData: {
    producer: { icon: 'Send', name: 'Producer', color: 'violet' },
    broker: { icon: 'Radio', name: 'Kafka', subtitle: 'Event Broker', color: 'amber' },
    consumer1: { icon: 'Bell', name: 'Notifications', color: 'blue' },
    consumer2: { icon: 'FileText', name: 'Analytics', color: 'emerald' },
    consumer3: { icon: 'Archive', name: 'Storage', color: 'zinc' },
  },
  connectors: [
    { from: 'producer', to: 'broker', fromAnchor: 'right', toAnchor: 'left', style: 'events' },
    { from: 'broker', to: 'consumer1', fromAnchor: 'topRight', toAnchor: 'left', style: 'subscribe' },
    { from: 'broker', to: 'consumer2', fromAnchor: 'right', toAnchor: 'left', style: 'subscribe' },
    { from: 'broker', to: 'consumer3', fromAnchor: 'bottomRight', toAnchor: 'left', style: 'subscribe' },
  ],
  connectorStyles: {
    events: { color: 'violet', strokeWidth: 2, label: 'Events' },
    subscribe: { color: 'amber', strokeWidth: 1, dashed: true },
  },
}
```

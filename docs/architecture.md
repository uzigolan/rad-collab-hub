# RAD Collaboration Hub — Vision & Architecture

> **Version:** Draft 0.1  
> **Status:** Design Document  
> **Repository:** `rad-collab-hub`

---

# Overview

RAD Collaboration Hub is an open-source collaborative web platform for AI-assisted software development.

Rather than being built around a single AI provider, RAD Collaboration Hub provides a unified collaboration layer capable of hosting multiple AI coding backends through a common interface.

The project is designed to make AI-assisted development collaborative, allowing teams to share workspaces, sessions, context, and conversations regardless of the underlying AI provider.

The first implementation targets GitHub Copilot CLI, but the architecture is intentionally provider-agnostic.

---

# Vision

Modern AI coding assistants are typically designed for a single developer working locally.

RAD Collaboration Hub transforms this model into a collaborative environment where multiple developers can work together with AI in shared sessions.

The platform should become the equivalent of GitHub for AI-assisted development:

- shared workspaces
- collaborative sessions
- reusable context
- centralized management
- provider independence

---

# Core Principles

## Provider Agnostic

The application should never depend on a specific AI provider.

Everything communicates through provider interfaces.

Supported providers may include:

- GitHub Copilot CLI
- Claude Code
- Codex CLI
- Ollama
- LM Studio
- OpenCode
- Future ACP-compatible providers
- Custom providers

---

## Collaboration First

Unlike desktop AI assistants, collaboration is a first-class feature.

Examples:

- invite team members
- share AI sessions
- watch AI responses in real time
- transfer ownership
- collaborate on prompts
- collaborative code generation

---

## Workspace Oriented

Everything belongs to a workspace.

Examples:

Workspace

- repositories
- sessions
- users
- permissions
- history
- configuration

---

## Extensible

Every major subsystem should be replaceable.

Examples:

Authentication

- GitHub OAuth
- Microsoft
- Google
- LDAP
- Local accounts

Database

- PostgreSQL
- SQLite (development)

Storage

- Local filesystem
- S3
- Azure
- GCS

Providers

- Plugin architecture

---

# High Level Architecture

```text
                        Browser

                           │

             React / Next.js Frontend

                           │

                  HTTPS / WebSocket

                           │

                 RAD Collaboration Hub

      ┌─────────────────────────────────────┐
      │                                     │
      │ Authentication                      │
      │ Users                               │
      │ Workspaces                          │
      │ Sessions                            │
      │ Permissions                         │
      │ Provider Manager                    │
      │ Collaboration                       │
      │ Event Streaming                     │
      │ Storage                             │
      │                                     │
      └─────────────────────────────────────┘

                           │

                    Provider Interface

        ┌──────────┬────────────┬────────────┐
        │          │            │            │
        ▼          ▼            ▼            ▼

 GitHub Copilot  Claude Code  Codex CLI   Ollama

                           │

                  Future Providers
```

---

# Major Components

## Frontend

Responsibilities

- chat interface
- workspace browser
- repository browser
- collaborative editor
- session history
- administration
- provider selection
- live streaming

Possible technologies

- React
- Next.js
- TypeScript
- Tailwind CSS
- WebSockets

---

## Backend API

Responsibilities

- authentication
- authorization
- session management
- workspace management
- provider routing
- streaming
- persistence
- REST API
- WebSocket gateway

Possible technologies

- Node.js
- Express
- Fastify

---

## Provider Manager

The Provider Manager abstracts every AI backend.

Every provider implements the same interface.

Example

```
Create Session

Send Prompt

Receive Stream

Cancel

Shutdown

Health Check
```

This prevents business logic from depending on a specific AI implementation.

---

# Providers

## GitHub Copilot CLI

Initial provider.

Uses ACP.

---

## Claude Code

Future provider.

---

## Codex CLI

Future provider.

---

## Ollama

Self-hosted local models.

---

## LM Studio

Desktop-hosted models.

---

## Custom Provider

Plugin API.

---

# Workspace Model

Workspace

Contains

- users
- repositories
- sessions
- permissions
- settings
- provider configuration

Example

```
Workspace

├── Repository A
├── Repository B

├── Session 1
├── Session 2

├── Alice
├── Bob
└── Charlie
```

---

# Session Model

Each AI conversation becomes a managed session.

Session properties

- ID
- owner
- workspace
- provider
- repository
- working directory
- status
- created
- updated

Lifecycle

```
Created

↓

Running

↓

Idle

↓

Archived

↓

Deleted
```

---

# Collaboration

Future collaborative features

- multiple viewers
- shared prompts
- live token streaming
- session ownership transfer
- participant permissions
- AI activity indicators
- collaborative prompt editing

---

# Authentication

Planned authentication methods

- GitHub OAuth
- Google
- Microsoft
- Local accounts
- Enterprise LDAP

---

# Authorization

Role based access.

Possible roles

Administrator

Workspace Admin

Developer

Viewer

Guest

---

# Database

Recommended

PostgreSQL

Possible schema

Users

Workspaces

Workspace Members

Repositories

Sessions

Messages

Providers

Permissions

Audit Events

Settings

---

# Streaming

Transport

WebSocket

Streaming events

Prompt Started

Token Received

Thinking

Tool Call

Tool Output

Completed

Cancelled

Error

---

# Provider Interface

Every provider should expose equivalent capabilities.

Example

```
initialize()

authenticate()

createSession()

sendMessage()

cancel()

stream()

shutdown()
```

---

# Future Plugin System

Potential plugin types

Authentication

Providers

Storage

Notifications

Integrations

Custom tools

---

# Administration

Future administration features

Dashboard

Users

Sessions

Providers

Health

Logs

Audit

Configuration

---

# API

Potential REST endpoints

```
GET    /workspaces

POST   /workspaces

GET    /sessions

POST   /sessions

POST   /messages

GET    /providers

POST   /providers

GET    /users
```

---

# Roadmap

## Phase 1

Foundation

- Fork copilot-remote
- Rebrand
- Understand architecture
- Clean codebase

---

## Phase 2

Core Platform

- Authentication
- PostgreSQL
- Workspace model
- User management
- Session persistence

---

## Phase 3

Collaboration

- Multi-user sessions
- Live collaboration
- Permissions
- Presence
- Activity feed

---

## Phase 4

Multi-provider

- Claude Code
- Codex CLI
- Provider abstraction
- Provider management

---

## Phase 5

Self-hosted AI

- Ollama
- LM Studio
- Local inference
- Model management

---

## Phase 6

Enterprise

- RBAC
- Audit logs
- Teams
- Organization support
- High availability

---

# Long-Term Goal

RAD Collaboration Hub should become the standard collaborative platform for AI-assisted software development.

Instead of replacing existing AI coding assistants, it provides a common collaboration layer that enables developers and teams to work together using cloud-hosted or self-hosted AI backends through a consistent, extensible interface.

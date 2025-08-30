# AI-lure Orchestrator

## Overview

AI-lure Orchestrator is a comprehensive API management and orchestration platform that enables users to manage API keys, integrate with external services, and monitor API usage through a modern web dashboard. The application provides a centralized hub for API management with real-time analytics, rate limiting, and integration capabilities for various external APIs including weather, news, social media, and AI services.

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend Architecture
- **Framework**: React 18 with TypeScript in Single Page Application (SPA) architecture
- **Build Tool**: Vite for fast development and optimized production builds
- **Routing**: Wouter for lightweight client-side routing
- **State Management**: TanStack React Query for server state management and caching
- **UI Components**: Radix UI primitives with shadcn/ui components for consistent design system
- **Styling**: Tailwind CSS with CSS custom properties for theming
- **Form Handling**: React Hook Form with Zod validation for type-safe form management

### Backend Architecture
- **Runtime**: Node.js with Express.js RESTful API server
- **Language**: TypeScript with ES modules for modern JavaScript features
- **Database**: PostgreSQL with Drizzle ORM for type-safe database operations
- **Authentication**: JWT-based authentication with bcrypt password hashing
- **API Security**: Rate limiting middleware and API key-based authentication
- **Session Management**: Express sessions with PostgreSQL session store
- **Development**: Hot module replacement with Vite integration for seamless development

### Database Design
- **ORM**: Drizzle ORM with schema-first approach for type safety
- **Tables**: Users, API Keys, Request Logs, and Integrations with proper foreign key relationships
- **Schema Validation**: Zod schemas for runtime validation and TypeScript type generation
- **Migrations**: Drizzle Kit for database schema migrations and version control

### Authentication & Authorization
- **User Authentication**: JWT tokens stored in localStorage with secure HTTP-only options
- **API Authentication**: SHA-256 hashed API keys with configurable rate limits per key
- **Password Security**: bcrypt hashing with salt rounds for secure password storage
- **Session Management**: PostgreSQL-backed sessions for stateful authentication

### API Management Features
- **Rate Limiting**: Configurable per-API-key rate limiting with hourly request quotas
- **Request Logging**: Comprehensive logging of API requests with response times and error tracking
- **Analytics**: Real-time usage statistics, performance metrics, and error rate monitoring
- **Integration Management**: Support for external API integrations with configuration storage

## External Dependencies

### Database & Storage
- **Neon Database**: Serverless PostgreSQL database with connection pooling
- **Drizzle ORM**: Type-safe database toolkit with PostgreSQL adapter

### Authentication & Security
- **bcrypt**: Password hashing library for secure credential storage
- **jsonwebtoken**: JWT token generation and validation
- **express-rate-limit**: Rate limiting middleware for API protection

### Frontend Libraries
- **Radix UI**: Accessible component primitives for UI foundation
- **TanStack React Query**: Data fetching and caching library
- **React Hook Form**: Form state management with validation
- **Zod**: TypeScript-first schema validation library
- **Tailwind CSS**: Utility-first CSS framework for styling
- **Lucide React**: Icon library for consistent iconography

### Development Tools
- **Vite**: Build tool with hot module replacement for development
- **TypeScript**: Static type checking and enhanced developer experience
- **ESBuild**: Fast JavaScript bundler for production builds

### Runtime & Hosting
- **Express.js**: Web application framework for Node.js
- **WebSocket**: Real-time communication support via ws library
- **CORS**: Cross-origin resource sharing configuration
- **Helmet**: Security middleware for Express applications
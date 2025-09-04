# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

lazy-ctrl is a pure gRPC-based remote PC control system with three main components:

1. **Controller Agent (Go)**: Local gRPC server that executes commands on the target PC
2. **Web Frontend (React + Vite)**: Control interface accessible via web browser  
3. **Cloud Middleware (Go)**: Optional cloud proxy service for remote access

## Architecture

The system supports two connection modes:
- **Direct Mode**: Frontend → gRPC-Web → Local Controller (port 7071)
- **Cloud Mode**: Frontend → gRPC-Web → Cloud Middleware → gRPC → Local Controller

All components use gRPC/gRPC-Web for communication with shared protobuf definitions via the unified GatewayService interface.

## Key Features

- Command registration system using `config/commands.json`
- Cross-platform support (Windows/macOS/Linux)
- Security features: command whitelist, PIN verification, rate limiting
- Real-time status feedback and execution logging
- Device management and multi-user access control

## Development Structure

- Go Agent handles command execution and provides gRPC server
- React frontend provides control interface with connection management
- Go cloud middleware manages device registration and request proxying
- Shared protobuf definitions ensure type safety across all components

## Security Architecture

- Commands must be pre-registered in whitelist
- Path isolation for script execution
- Optional PIN verification
- Execution frequency limits
- JWT-based authentication for cloud mode
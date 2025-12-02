# Code Companion Node.js TypeScript Template

This repository provides a template for building Fastify-based Node.js applications using TypeScript. It includes a pre-configured setup for development, testing, linting, and deployment.

## Features

- **Fastify Framework**: A fast and low-overhead web framework for Node.js.
- **TypeScript**: Strongly typed JavaScript for better developer experience.
- **Environment Configuration**: `.env` support via `dotenv`.
- **Testing**: Pre-configured with `node:test` and `supertest`.
- **Linting**: Code linting and formatting using Biome.
- **Docker Support**: Dockerfile for containerized deployment.
- **GitHub Actions**: CI/CD pipeline for building, linting, and testing.
- **Dependabot**: Automated dependency updates.

## Getting Started

### Prerequisites

- [Node.js](https://nodejs.org/) (version `22.15.0` recommended, see `.nvmrc`)
- [Docker](https://www.docker.com/) (optional, for containerized deployment)

### Installation

1. Use this repository as a template:

   - Click the **"Use this template"** button on the [GitHub repository page](https://github.com/CodeCompanionBE/code-companion-node-ts-template).
   - Create a new repository based on this template.

2. Clone your newly created repository:

   ```bash
   git clone ...
   cd your-repo-name
   ```

3. Install dependencies:

   ```bash
   npm install
   ```

4. Copy the example environment file and configure it:

   ```bash
   cp .env.example .env
   ```

### Development

Start the development server with hot-reloading:

```bash
npm run dev
```

The server will run on `http://localhost:3000` by default.

### Testing

Run the test suite:

```bash
npm test
```

### Linting

Lint the codebase:

```bash
npm run lint
```

### Docker

Build the Docker image:

```bash
npm run docker:build
```

Run the Docker container:

```bash
npm run docker:run
```

### Auto-Update

The application includes built-in auto-update functionality that checks for new releases from GitHub at startup.

#### Configuration

Configure auto-update in your `.env` file:

```bash
# Enable automatic checking for new releases at application startup
AUTO_UPDATE_ENABLED=true

# Repository information
GITHUB_OWNER=screenable
GITHUB_REPO=printable

# Optional: GitHub Personal Access Token
# Only required for private repositories
# For public repositories, you can omit this or leave it empty
GITHUB_TOKEN=ghp_your_github_token_here

# Auto-apply updates (will restart the application)
# Set to 'false' to only check and notify about updates
AUTO_UPDATE_APPLY=false
```

#### How it Works

1. **At Application Startup**: If `AUTO_UPDATE_ENABLED=true`, the app checks GitHub for the latest release
2. **Version Comparison**: Compares the current version (from `package.json`) with the latest release
3. **Update Notification**: If an update is available, it logs the version difference
4. **Auto-Apply (Optional)**: If `AUTO_UPDATE_APPLY=true`, it will:
   - Fetch the latest git tags
   - Checkout the latest tag
   - Run `npm ci` to install dependencies
   - Run `npm run build` to build the application
   - Exit the process (requires a process manager like systemd or pm2 to restart)

#### GitHub Token

- **For Public Repositories**: No token is needed. The auto-updater can check public releases without authentication
- **For Private Repositories**: Generate a Personal Access Token:
  1. Go to [GitHub Settings → Developer Settings → Personal Access Tokens](https://github.com/settings/tokens)
  2. Click "Generate new token (classic)"
  3. Give it a name (e.g., "Printable Auto-Update")
  4. Select the `repo` scope
  5. Copy the token and add it to your `.env` file as `GITHUB_TOKEN`

**Note**: The `GITHUB_TOKEN` used by GitHub Actions workflows is different and is automatically provided by GitHub with appropriate permissions. You don't need to configure it.

### CI/CD

This repository includes GitHub Actions workflows:

1. **Build and Check** (`build-and-check.yml`): Runs on pushes and pull requests to the `main` branch. Builds, lints, and tests the application.

2. **Automatic Release** (`release.yml`): Automatically creates a new GitHub release when code is merged to the `main`/`master` branch. The workflow:
   - Checks the current version in `package.json`
   - Automatically bumps the patch version if a release with the current version already exists
   - Creates a git tag for the new version
   - Generates a changelog from git commits
   - Creates a GitHub release with the changelog
   - Marks each release as the "latest" release (using `make_latest: true`)
   - Uses the built-in `GITHUB_TOKEN` which is automatically provided by GitHub Actions with appropriate permissions

The release workflow ensures that every merge to the main branch results in a new versioned release, making it easy to track changes and updates.

## Project Structure

```
.
├── src
│   ├── routes          # Fastify route definitions
│   ├── server.ts       # Fastify server setup
│   └── index.ts        # Application entry point
├── .github
│   └── workflows       # GitHub Actions workflows
├── .vscode             # VS Code settings
├── Dockerfile          # Docker configuration
├── package.json        # Project metadata and scripts
├── tsconfig.json       # TypeScript configuration
└── .env.example        # Example environment variables
```

## Scripts

- `npm run dev`: Start the development server.
- `npm test`: Run tests.
- `npm run lint`: Lint the codebase.
- `npm run docker:build`: Build the Docker image.
- `npm run docker:run`: Run the Docker container.

## Contributing

Contributions are welcome! Please follow these steps:

1. Fork the repository.
2. Create a new branch for your feature or bugfix.
3. Commit your changes with clear and concise messages.
4. Submit a pull request.

## License

This project is licensed under the [MIT License](LICENSE).

## Author

Created by [Niels Van den Broeck](https://github.com/CodeCompanionBE).

## Acknowledgments

- [Fastify](https://www.fastify.io/) for the web framework.
- [TypeScript](https://www.typescriptlang.org/) for type safety.
- [Docker](https://www.docker.com/) for containerization.

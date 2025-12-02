# Contributing to Radius

Thank you for your interest in contributing to Radius! This document provides guidelines for contributing to the project.

## Getting Started

1. Fork the repository
2. Clone your fork:
   ```bash
   git clone https://github.com/YOUR-USERNAME/Radius.git
   cd Radius
   ```
3. Install dependencies:
   ```bash
   npm install
   ```
4. Run the development server:
   ```bash
   npm run dev
   ```

## Development Workflow

### Making Changes

1. Create a new branch for your feature/fix:
   ```bash
   git checkout -b feature/your-feature-name
   ```

2. Make your changes and test them locally

3. Run the linter/formatter:
   ```bash
   npm run format
   ```

4. Build the project to ensure it compiles:
   ```bash
   npm run build
   ```

5. Commit your changes with a descriptive message:
   ```bash
   git commit -m "Add: description of your changes"
   ```

6. Push to your fork:
   ```bash
   git push origin feature/your-feature-name
   ```

7. Open a Pull Request

### Testing Deployments

If you're making changes that affect deployment configurations, please test them:

1. **Local Testing:**
   ```bash
   npm run bstart
   ```
   Visit http://localhost:8080 to verify the app works

2. **Docker Testing:**
   ```bash
   docker build -t radius-test .
   docker run -p 8080:8080 radius-test
   ```

3. **Platform Testing:**
   - For platform-specific changes, test on the relevant platform
   - Document any platform-specific issues in your PR

## Code Style

- Follow the existing code style
- Use TypeScript for type safety
- Run `npm run format` before committing
- Keep code changes focused and minimal

## Pull Request Guidelines

- Provide a clear description of the changes
- Reference any related issues
- Include screenshots for UI changes
- Ensure the build passes
- Update documentation if needed

## Deployment Configuration Changes

If you're modifying deployment configurations:

1. Test the configuration on the target platform if possible
2. Document any new environment variables in DEPLOYMENT.md
3. Update README.md if adding a new deployment option
4. Ensure backward compatibility where possible

## Reporting Issues

When reporting issues, please include:
- A clear description of the problem
- Steps to reproduce
- Expected vs actual behavior
- Screenshots if applicable
- Platform/browser information
- Console errors (if any)

## Questions?

Join our [Discord](https://discord.gg/cCfytCX6Sv) for community support!

## License

By contributing, you agree that your contributions will be licensed under the same license as the project.

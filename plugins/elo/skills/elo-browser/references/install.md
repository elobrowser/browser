# Install or upgrade Elo

Read this file only when `elo-browser` is not found, when `elo-browser skill` reports an unknown command, or when the user asks to install Elo. For day-to-day browser work, run `elo-browser skill` and follow its output.

The elo-browser skill depends on the Elo browser: the `elo-browser` command is provided by the Elo app. Once Elo is installed and you've completed onboarding, no additional setup is normally needed.

Elo website: https://elobrowser.com

## Upgrade an older Elo

If `elo-browser` exists but `elo-browser skill` reports `Unknown command: skill`, the installed Elo is older than this skill. Ask the user for approval, then run:

```bash
elo-browser upgrade
```

If `upgrade` is also an unknown command, reinstall with the steps for the user's operating system. Then continue with "After installing: confirm `elo-browser` is available" in that file.

## Install

The install steps, the commands that confirm the installation, and the troubleshooting differ by operating system. Read the file for the machine you are running on and follow it to the end:

- macOS: [install-macos.md](install-macos.md)
- Windows: [install-windows.md](install-windows.md)
- Other platforms: there is no installer. Have the user check https://elobrowser.com/ for a build; if none exists, elo-browser is not available on this machine.

## Onboarding

Onboarding is a step the user completes in the GUI, on every platform:

- Choose to import data from Chrome or another browser as needed.
- Onboarding registers the `elo-browser` command on the PATH.

After the app opens, wait for the user to confirm they've finished onboarding before continuing. The per-platform file explains how to confirm the command is available afterwards.

## After that, return to the original task

Once the environment is ready, return to the user's original task: run `elo-browser skill` and follow its output.

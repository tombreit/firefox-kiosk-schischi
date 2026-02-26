# Firefox Kiosk Schischi

A Firefox extension that adds a minimal navigation toolbar (back, home, forward) to
Firefox running in `--kiosk` mode.

Firefox's built-in `--kiosk` flag locks down the UI but removes all navigation controls.
This extension re-adds a compact top toolbar without obstructing page content.

## Features

- Back / Home / Forward buttons, always visible
- Back and Forward buttons are greyed out when there is no history in that direction
- Read-only URL bar showing the current page address
- Right-click context menu suppressed (belt-and-suspenders with `--kiosk`)
- No user-configurable settings — uses the homepage set in Firefox preferences

## Build

Requires Python 3 (no dependencies beyond the standard library).

```bash
python3 build.py
# → public/firefox-kiosk-schischi.xpi
```

## Usage

```bash
firefox-esr --kiosk https://your-start-page.example.com
```

## CI/CD

The GitLab CI pipeline (`.gitlab-ci.yml`) builds the XPI on every push and publishes
it to GitLab Pages on the `main` branch.

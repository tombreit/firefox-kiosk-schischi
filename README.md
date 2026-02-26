# Firefox Kiosk Schischi

A Firefox extension that adds a minimal navigation toolbar (back, home, forward) to
Firefox running in `--kiosk` mode.

Firefox's built-in `--kiosk` flag locks down the UI but removes all navigation controls.
This extension re-adds a compact top toolbar without obstructing page content.

## Features

- Back / Home / Forward buttons, always visible
- Back and Forward buttons are greyed out when there is no history in that direction
- Read-only URL bar showing the current page address
- No user-configurable settings — uses the homepage set in Firefox preferences

## Build

Requires [web-ext](https://github.com/mozilla/web-ext):

```bash
npm install
web-ext lint        # check for errors
web-ext build       # → web-ext-artifacts/firefox_kiosk_schischi-*.zip
```

...or just zip to an `foo.xpi` file.

## Development

Install dependencies once to activate Git hooks:

```bash
npm install
```

A pre-commit hook runs `npx web-ext lint` and blocks commits when lint fails.

### Test locally

```bash
npx web-ext run
```

## Installation

### Deploy via Enterprise Policy

The extension can be deployed via an [Enterprise Policy](https://support.mozilla.org/en-US/kb/customizing-firefox-using-policy-file).

Policy file location (create the directory if it does not exist, regardless of Firefox or Firefox-ESR):

```txt
/etc/firefox/policies/policies.json
```

```json
{
  "policies": {
    "ExtensionSettings": {
      "firefox-kiosk-schischi@csl.mpg.de": {
        "private_browsing": true,
        "installation_mode": "force_installed",
        "install_url": "https://firefox-kiosk-schischi-e944d5.pages.gwdg.de/firefox-kiosk-schischi.xpi"
      }
    }
  }
}
```

Verify the policy is active by opening `about:policies` in Firefox.

## Usage

```bash
firefox-esr --kiosk https://your-start-page.example.com
```

## CI/CD

The GitLab CI pipeline (`.gitlab-ci.yml`) has three stages:

1. **build** — builds an unsigned `.xpi` as a downloadable artifact on every push
2. **sign** — signs the extension via Mozilla's AMO API using `web-ext` (`main` branch only)
3. **deploy** — publishes the signed `.xpi` and `index.html` to GitLab Pages (`main` branch only)

The signing step requires two CI/CD variables to be set in GitLab
(**Settings → CI/CD → Variables**, mark both as masked):

| Variable | Description |
| --- | --- |
| `WEB_EXT_API_KEY` | JWT issuer from [addons.mozilla.org API credentials](https://addons.mozilla.org/developers/addon/api/key/) |
| `WEB_EXT_API_SECRET` | JWT secret from the same page |

For listed AMO submissions, CI passes `amo-metadata.json` to `web-ext sign`.
That file currently sets `version.license` to `MPL-2.0`, which avoids AMO API
errors like "version.license is required".

When `main` is built, CI publishes the signed `firefox-kiosk-schischi.xpi`.

Updates are handled by AMO directly once users install the extension from AMO.
You still need to bump `manifest.json` manually before each new AMO signing
submission, because AMO rejects duplicate versions.

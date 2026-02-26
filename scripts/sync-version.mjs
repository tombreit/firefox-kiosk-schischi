#!/usr/bin/env node
// sync-version.mjs
// Generates a version string and updates manifest.json accordingly.
// Scheme: major.increment.0-shortgit

import {readFileSync, writeFileSync, existsSync} from 'fs';
import {execSync} from 'child_process';
import path from 'path';

const MAJOR = 2;
const STATE_FILE = path.resolve(process.cwd(), 'version.json');
const MANIFEST = path.resolve(process.cwd(), 'manifest.json');
const PLACEHOLDER = '__VERSION__';

function loadState() {
  if (existsSync(STATE_FILE)) {
    const data = JSON.parse(readFileSync(STATE_FILE, 'utf8'));
    // ensure keys exist
    return {
      major: typeof data.major === 'number' ? data.major : MAJOR,
      increment: typeof data.increment === 'number' ? data.increment : 0,
    };
  }
  return {major: MAJOR, increment: 0};
}

function saveState(state) {
  writeFileSync(STATE_FILE, JSON.stringify(state, null, 2) + '\n');
}

function gitHash() {
  try {
    // short 7 characters
    return execSync('git rev-parse --short=7 HEAD', {encoding: 'utf8'}).trim();
  } catch (e) {
    return 'nogit';
  }
}

function bump(state) {
  if (state.major !== MAJOR) {
    state.major = MAJOR;
    state.increment = 0;
  }
  state.increment += 1;
  return state;
}

function makeVersion(state) {
  const hash = gitHash();
  // semver: patch component fixed to 0, hash as prerelease
  return `${state.major}.${state.increment}.0-${hash}`;
}

function updateManifest(version) {
  let content = readFileSync(MANIFEST, 'utf8');
  // simple replace of version field, assuming double quotes around value
  content = content.replace(
    /("version"\s*:\s*")[^"\n]+("\s*,?)/,
    `$1${version}$2`
  );
  writeFileSync(MANIFEST, content);
}

function runLint(tempVersion) {
  // web-ext lint is picky; it doesn't like the prerelease hash we add.
  // use a simpler numeric string when linting, but restore the real value
  const simple = tempVersion.replace(/-.+$/, '');
  const original = readFileSync(MANIFEST, 'utf8');
  updateManifest(simple);
  try {
    execSync('npx web-ext lint', {stdio: 'inherit'});
  } finally {
    writeFileSync(MANIFEST, original);
  }
}

async function main() {
  const args = process.argv.slice(2);
  let noBump = false;
  let doLint = false;
  let dry = false;
  for (const arg of args) {
    if (arg === '--no-bump') noBump = true;
    else if (arg === '--lint') doLint = true;
    else if (arg === '--dry-run') dry = true;
  }

  const state = loadState();
  if (!noBump && !doLint && !dry) {
    bump(state);
    saveState(state);
  }

  const version = makeVersion(state);

  if (dry) {
    console.log(version);
    process.exit(0);
  }

  if (doLint) {
    runLint(version);
    console.log(version);
    process.exit(0);
  }

  updateManifest(version);
  console.log(version);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});

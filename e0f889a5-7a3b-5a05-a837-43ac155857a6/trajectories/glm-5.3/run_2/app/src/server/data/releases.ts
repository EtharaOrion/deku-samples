export const SEED_RELEASES = [
  {
    version: '2.0.0', build: 2000, released_on: '2024-12-11', artifact_name: 'arranger-2.0.0.dmg',
    size_bytes: 154876459,
    sha256: '9f2a41c0d83bb6f9127ae5c40d92b8e31f6a7c05d4e8931b2f4d0e6a1c8b39f2',
    description: 'Arranger 2.0 brings the whole camera under one window.',
    notes: {
      'Newly Added': [
        'A single window that holds import, library and export side by side.',
        'Firmware writing over USB for every Vela camera, replacing the separate installer.',
        'Per-camera colour profiles that follow the serial rather than the library.'
      ],
      'Improvements': [
        'Import from a card is about twice as fast on Apple silicon.',
        'The library grid holds its scroll position when a card is ejected.'
      ],
      'Bug Fixes': [
        'Fixed a crash when a library was opened from a read-only volume. [#412]',
        'Fixed a wrong white balance read from Vela Cricket firmware 6.11. [#415]'
      ],
      'Known Issues': [
        'Exports to ProRes ignore custom LUTs on macOS 14.0 only.'
      ]
    }
  },
  {
    version: '1.4.4', build: 1440, released_on: '2024-06-26', artifact_name: 'arranger-1.4.4.dmg',
    size_bytes: 160301059,
    sha256: '0a1f0a96c8bd8e0470ac8208306431f0c6ad7d9db21c94764e4bd8db8de8820e',
    description: 'A small release that fixes two things people were waiting on.',
    notes: {
      'Newly Added': [
        'Added a command to rebuild thumbnails for a whole library.'
      ],
      'Improvements': [
        'The update checker reports the build number rather than the version string.'
      ],
      'Bug Fixes': [
        'Fixed firmware writing for Vela A1 units running 2.0. [#398]',
        'Fixed a hang when two cameras were connected at once. [#401]'
      ],
      'Known Issues': []
    }
  },
  {
    version: '1.4.3', build: 1430, released_on: '2024-05-20', artifact_name: 'arranger-1.4.3.dmg',
    size_bytes: 158220144,
    sha256: '7d43c4a973ee2746c37a4cf3f6f21b9b9f2e94e37f8e18dd71a6457fa1c8b02d',
    description: 'Firmware updates for both cameras and a better card import.',
    notes: {
      'Newly Added': [
        'Added firmware update prompts that name the version and the build.',
        'Added a preference to keep the library on an external volume.'
      ],
      'Improvements': [
        'Card import now skips files that were already imported, by content.',
        'The export sheet remembers its last-used preset.'
      ],
      'Bug Fixes': [
        'Fixed a crash on launch when the default library was missing. [#377]'
      ],
      'Known Issues': [
        'Vela Cricket firmware 6.11 reports one frame short on each roll. The count is correct on the card.'
      ]
    }
  },
  {
    version: '1.4.2', build: 1420, released_on: '2024-05-20', artifact_name: 'arranger-1.4.2.dmg',
    size_bytes: 157903622,
    sha256: '3f5e0f37a1cfcb0d9c30a7ce7eb48f5c7d1a41d64f3cd8e12b7d0c8f9a2c1d60',
    description: 'The release that shipped alongside Vela Cricket.',
    notes: {
      'Newly Added': [
        'Added support for Vela Cricket.',
        'Added the release notes archive, opened from the Help menu.'
      ],
      'Improvements': [
        'Both cameras appear in one list, ordered by serial.'
      ],
      'Bug Fixes': [
        'Fixed a wrong serial shown in the about panel. [#350]',
        'Fixed a memory leak when the library window was left open overnight. [#354]'
      ],
      'Known Issues': [
        'Vela Cricket units built in week 09 need firmware 6.11 or later to import Raw.'
      ]
    }
  }
];

export function versionOrd(version: string): number {
  return version.split('.').reduce((acc: number, part: string) => acc * 1000 + Number(part), 0);
}

export function seedSha256For(version: string, build: number): string {
  return SEED_RELEASES.find((r) => r.build === build)?.sha256 || seedDigest(version, build);
}

export function seedDigest(version: string, build: number): string {
  return 'a1' + String(build).padStart(6, '0') + 'c4d5e6f7'.repeat(3) + 'b2' + String(build).padStart(6, '0');
}

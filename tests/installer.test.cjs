'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const pkg=JSON.parse(fs.readFileSync('package.json','utf8'));
const nsi=fs.readFileSync('installer.nsi','utf8');
const packager=fs.readFileSync('scripts/build-app.cjs','utf8');
const build=fs.readFileSync('scripts/Build-App.ps1','utf8');
const workflow=fs.readFileSync('.github/workflows/build-windows.yml','utf8');
const readme=fs.readFileSync('README.md','utf8');

test('NSIS packages all app files with the current name, version, and icon',()=>{
 assert.equal(pkg.version,'1.0.1');
 assert.ok(nsi.includes('!define MUI_ICON "assets\\icon.ico"'));
 assert.ok(nsi.includes('OutFile "artifacts\\VKSound-Setup-${APP_VERSION}.exe"'));
 assert.ok(nsi.includes('File /r /x ".vksound-build.json" "artifacts\\win-unpacked\\*"'));
 assert.ok(nsi.includes('WriteUninstaller "$INSTDIR\\Uninstall.exe"'));
 assert.ok(nsi.includes('!insertmacro MUI_PAGE_LICENSE "LICENSE"'));
 assert.ok(nsi.includes('DisplayVersion" "${APP_VERSION}"'));
});

test('automated build verifies a local portable NSIS and compiles the installer',()=>{
 assert.match(build,/\$nsisVersion = '3\.13'/);
 assert.match(build,/Get-FileHash -LiteralPath \$nsisZip -Algorithm SHA256/);
 assert.match(build,/Get-Command curl\.exe/);
 assert.match(build,/sourceforge\.net\/projects\/nsis\/files\/NSIS%203\/3\.13\/nsis-3\.13\.zip\/download/);
 assert.match(build,/Ожидаемый SHA-256: \$nsisHash/);
 assert.match(build,/Expand-Archive -LiteralPath \$nsisZip -DestinationPath \$tools -Force/);
 assert.match(build,/Bin\\makensis\.exe/);
 assert.match(build,/& \$makensis/);
 assert.match(build,/installer\.nsi/);
 assert.match(build,/NSIS не смог скомпилировать установщик/);
 assert.doesNotMatch(build,/ISCC\.exe|installer\.iss/);
 assert.match(build,/Файл установщика не найден после компиляции/);
});

test('Windows executable receives the same ICO asset used by the app',()=>{
 assert.equal(pkg.devDependencies.rcedit,'5.0.2');
 assert.match(packager,/import\('rcedit'\)/);
 assert.match(packager,/await editIcon\(path\.join\(stage,'VKSound\.exe'\),path\.join\(root,'assets','icon\.ico'\)\)/);
});

test('GitHub Actions builds on Windows and uploads the installer artifact',()=>{
 assert.match(workflow,/runs-on: windows-latest/);
 assert.match(workflow,/Build-App\.ps1 -CI/);
 assert.match(workflow,/artifacts\/VKSound-Setup-\*\.exe/);
 assert.match(workflow,/actions\/upload-artifact@v4/);
});

test('default-branch builds publish a stable installer link from the repository page',()=>{
 assert.match(workflow,/github\.event\.repository\.default_branch/);
 assert.match(workflow,/contents: write/);
 assert.match(workflow,/softprops\/action-gh-release@v2/);
 assert.match(workflow,/tag_name: latest/);
 assert.match(workflow,/VKSound-Setup-latest\.exe/);
 assert.match(readme,/releases\/latest\/download\/VKSound-Setup-latest\.exe/);
});

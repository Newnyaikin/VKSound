'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const s=fs.readFileSync('scripts/Build-App.ps1','utf8');
test('build header reads actual package version',()=>{assert.match(s,/ConvertFrom-Json\)\.version/);assert.doesNotMatch(s,/VKSound\s+\d+\.\d+\.\d+/);});
test('npm download retries and timeout remain process local and bounded',()=>{assert.match(s,/\$env:npm_config_fetch_retries = '2'/);assert.match(s,/\$env:npm_config_fetch_timeout = '60000'/);assert.ok(!s.includes('$attempt -le 3'));assert.match(s,/--prefer-offline/);assert.ok(!s.includes('strict-ssl=false'));assert.ok(!s.includes('npm config set'));});
test('build script is UTF-8 BOM for Windows PowerShell 5.1 Cyrillic',()=>{assert.deepEqual([...fs.readFileSync('scripts/Build-App.ps1').subarray(0,3)],[239,187,191]);});
test('CI build mode skips prompts and opening the output folder',()=>{
 assert.match(s,/param\(\s*\[switch\]\$CI\s*\)/);
 assert.match(s,/if \(\$CI\) \{\s*Write-Host 'Режим CI/);
 assert.match(s,/if \(!\$CI\) \{ Invoke-Item/);
});

test('rebuild skips ready dependencies and avoids destructive npm ci',()=>{assert.match(s,/dependencies-ready.cjs/);assert.match(s,/--ignore-scripts/);assert.ok(!s.includes('& $npm ci'));assert.match(s,/Get-ChildItem -LiteralPath \$tools/);});

test('Node.js candidates are accepted only with their matching npm.cmd',()=>{
 assert.match(s,/Join-Path \$local\.FullName 'npm\.cmd'/);
 assert.match(s,/Join-Path \$candidateDir 'npm\.cmd'/);
 assert.match(s,/if \(!\(Test-Path -LiteralPath \$localExe\) -or !\(Test-Path -LiteralPath \$localNpm\)\)/);
 assert.match(s,/if \(!\(Test-Path -LiteralPath \$candidateNpm\)\)/);
});

test('incomplete downloaded Node.js runtime is repaired and validated',()=>{
 assert.match(s,/if \(!\(Test-Path -LiteralPath \$nodeExe\) -or !\(Test-Path -LiteralPath \$npm\)\)/);
 assert.match(s,/Remove-Item -LiteralPath \$nodeDir -Recurse -Force/);
 assert.match(s,/В официальном архиве Node\.js не найден npm\.cmd/);
 assert.match(s,/Не удалось найти совместимую пару Node\.js и npm\.cmd/);
});

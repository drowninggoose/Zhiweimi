param([switch]$NoBrowser,[switch]$SkipBuild)
$ErrorActionPreference='Stop'
$projectDirectory=Split-Path -Parent $PSScriptRoot
Set-Location -LiteralPath $projectDirectory
# esbuild 的中间文件统一放项目内，避免系统临时目录拒绝删除导致构建失败
$localTemp=Join-Path $projectDirectory '.tmp'
New-Item -ItemType Directory -Force -Path $localTemp | Out-Null
$env:TMP=$localTemp
$env:TEMP=$localTemp
if(-not (Get-Command node -ErrorAction SilentlyContinue)){throw '请先安装 Node.js 24 LTS。'}
if(-not (Get-Command npm.cmd -ErrorAction SilentlyContinue)){throw '未找到 npm，请重新安装 Node.js 24 LTS 并确认已加入 PATH。'}
# 首次运行自动安装依赖：评委不需要懂 npm，双击即可
if(-not (Test-Path -LiteralPath (Join-Path $projectDirectory 'node_modules'))){
  Write-Host '首次运行，正在安装依赖（约 2-4 分钟，需要联网）……' -ForegroundColor Yellow
  & npm.cmd ci --no-audit --no-fund
  if($LASTEXITCODE -ne 0){
    Write-Host 'npm ci 失败，改用 npm install 重试……' -ForegroundColor Yellow
    & npm.cmd install --no-audit --no-fund
    if($LASTEXITCODE -ne 0){throw '依赖安装失败：请检查网络后重试，或先在项目目录执行 npm install。'}
  }
  Write-Host '依赖安装完成。' -ForegroundColor Green
}
if(-not $SkipBuild){& npm.cmd run build;if($LASTEXITCODE -ne 0){throw '构建失败，服务未启动。'}}
if(-not (Test-Path -LiteralPath (Join-Path $projectDirectory 'dist\index.html'))){throw '缺少生产构建，请执行 npm run build。'}
$appAddress='http://localhost:4173'
$existing=Get-NetTCPConnection -LocalPort 4173 -State Listen -ErrorAction SilentlyContinue
if($existing){
  $response=Invoke-WebRequest -Uri $appAddress -TimeoutSec 5 -UseBasicParsing
  $pageContent=[System.Text.Encoding]::UTF8.GetString($response.RawContentStream.ToArray())
  if($pageContent -notmatch '<title>知味咪</title>'){throw '4173端口已被其他服务使用，请先关闭该服务。'}
}else{
  $nodePath=(Get-Command node).Source
  $vitePath=Join-Path $projectDirectory 'node_modules\vite\bin\vite.js'
  $serverProcess=Start-Process -FilePath $nodePath -ArgumentList @('--import','"./scripts/tmp-env.mjs"',('"'+$vitePath+'"'),'preview','--host','localhost','--port','4173','--strictPort') -WorkingDirectory $projectDirectory -WindowStyle Hidden -PassThru
  $ready=$false
  $readinessError=''
  for($attempt=0;$attempt -lt 30;$attempt++){
    if($serverProcess.HasExited){throw '本地服务启动失败。'}
    try{Invoke-WebRequest -Uri $appAddress -TimeoutSec 1 -UseBasicParsing | Out-Null;$ready=$true;break}catch{$readinessError=$_.Exception.Message;Start-Sleep -Milliseconds 500}
  }
  if(-not $ready){Stop-Process -Id $serverProcess.Id -ErrorAction SilentlyContinue;throw ('本地服务未能及时启动：'+$readinessError)}
  Write-Output ('知味咪已启动，服务 PID：'+$serverProcess.Id)
}
if(-not $NoBrowser){Start-Process $appAddress}
Write-Output ('访问 '+$appAddress+'；请固定使用同一个浏览器。')

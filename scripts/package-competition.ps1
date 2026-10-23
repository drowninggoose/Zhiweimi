$ErrorActionPreference = 'Stop'
$projectDirectory = Split-Path -Parent $PSScriptRoot
$outputDirectory = Join-Path $projectDirectory 'output\competition'
$stageDirectory = Join-Path $outputDirectory 'Zhiweimi'
$archivePath = Join-Path $outputDirectory 'Zhiweimi-competition-package.zip'
Set-Location -LiteralPath $projectDirectory

Write-Output '1/4 运行单元测试...'
& npm.cmd test
if ($LASTEXITCODE -ne 0) { throw '单元测试未通过，已停止打包。' }

Write-Output '2/4 生产构建...'
& npm.cmd run build
if ($LASTEXITCODE -ne 0) { throw '生产构建失败，已停止打包。' }

Write-Output '3/4 收集可提交文件（排除 .env 与依赖）...'
if (Test-Path -LiteralPath $stageDirectory) { Remove-Item -LiteralPath $stageDirectory -Recurse -Force }
New-Item -ItemType Directory -Force -Path $stageDirectory | Out-Null
$files = @(
  'package.json', 'package-lock.json', 'index.html', 'vite.config.ts',
  'tsconfig.json', 'tsconfig.app.json', 'tsconfig.node.json', 'eslint.config.js',
  'README.md', 'PRD.md', 'DEVELOPMENT_PLAN.md', '.env.example', 'start-local.cmd'
)
# 不打包 dist：start-local 首次启动会自动构建，去掉后包体少一半
$directories = @('src', 'server', 'public', 'scripts', 'docs')
foreach ($file in $files) {
  $source = Join-Path $projectDirectory $file
  if (Test-Path -LiteralPath $source) { Copy-Item -LiteralPath $source -Destination $stageDirectory }
}
foreach ($directory in $directories) {
  $source = Join-Path $projectDirectory $directory
  if (Test-Path -LiteralPath $source) { Copy-Item -LiteralPath $source -Destination $stageDirectory -Recurse }
}
if (Test-Path -LiteralPath $archivePath) { Remove-Item -LiteralPath $archivePath -Force }

Write-Output '4/4 生成 zip...'
Compress-Archive -LiteralPath $stageDirectory -DestinationPath $archivePath -CompressionLevel Optimal
Write-Output ('完成：' + $archivePath)
Write-Output '包里不含 .env 与密钥；首次启动会自动安装依赖并构建。'

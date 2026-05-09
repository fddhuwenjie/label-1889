# 应用图标资源

此目录用于存放应用打包所需的图标文件。

## 所需文件

### macOS
- `icon.icns` - macOS 应用图标（包含多种尺寸：16x16, 32x32, 64x64, 128x128, 256x256, 512x512, 1024x1024）

### Windows
- `icon.ico` - Windows 应用图标（包含多种尺寸：16x16, 32x32, 48x48, 64x64, 128x128, 256x256）

### Linux
- `icon.png` - Linux 应用图标（建议 512x512 或 1024x1024）

## 图标生成工具

可以使用以下工具从单个 PNG 图片生成所有平台的图标：

1. **electron-icon-builder** (推荐)
   ```bash
   npm install -g electron-icon-builder
   electron-icon-builder --input=./icon.png --output=./assets
   ```

2. **在线工具**
   - https://www.electron.build/icons
   - https://iconverticons.com/online/

## 图标设计建议

- 使用简洁的设计，确保在小尺寸下仍然清晰可辨
- 建议使用 1024x1024 的源图片
- 保持透明背景（PNG 格式）
- 主色调建议使用应用的主题色（蓝色 #1890ff 或紫色 #722ed1）

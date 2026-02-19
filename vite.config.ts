import { defineConfig } from 'vite'

export default defineConfig({
    // GitHub Pages 部署时使用仓库名作为 base
    // 本地开发时用 '/'，部署到 GitHub Pages 时需要改成 '/仓库名/'
    // 通过环境变量自动切换
    base: process.env.GITHUB_ACTIONS ? '/arrowPuzzle/' : '/',
})

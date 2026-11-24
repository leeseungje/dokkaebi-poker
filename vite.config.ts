import { defineConfig } from 'vite';

// GitHub Pages 주소가 https://leeseungje.github.io/dokkaebi-poker/ 이므로 base 를 맞춘다
export default defineConfig({
  base: './',
  build: { target: 'es2022' },
});

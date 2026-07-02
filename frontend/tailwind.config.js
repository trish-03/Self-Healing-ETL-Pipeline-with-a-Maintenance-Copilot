/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
    "../src/**/*.{js,ts,jsx,tsx}" // Captures it if Vite builds from a folder offset
  ],
  theme: {
    extend: {},
  },
  plugins: [],
}
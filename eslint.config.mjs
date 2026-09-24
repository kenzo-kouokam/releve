import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import vue from 'eslint-plugin-vue';
import prettier from 'eslint-config-prettier';

export default tseslint.config(
  {
    ignores: [
      '**/node_modules/**',
      '**/dist/**',
      '**/.nuxt/**',
      '**/.output/**',
      'docs/**',
      'backend/prisma/migrations/**',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  ...vue.configs['flat/recommended'],
  {
    files: ['**/*.vue'],
    languageOptions: {
      parserOptions: { parser: tseslint.parser },
    },
    rules: {
      // Les pages Nuxt sont nommees par leur chemin de fichier.
      'vue/multi-word-component-names': 'off',
    },
  },
  {
    // Nuxt auto-importe ref, computed, useFetch, navigateTo, les composables de
    // app/composables... ESLint ne les voit pas. C'est TypeScript (nuxt
    // typecheck, avec les types generes dans .nuxt) qui attrape les vrais
    // identifiants inconnus ici : la regle ferait double emploi en criant faux.
    files: ['frontend/**/*.{ts,vue}'],
    rules: {
      'no-undef': 'off',
    },
  },
  {
    // Outils de developpement lances par `node`, hors du bundle : ils parlent
    // aux globales de la plateforme. Les declarer ici plutot que d'ajouter le
    // paquet `globals` pour cinq noms, et plutot que d'eteindre `no-undef`, qui
    // reste utile sur le reste du fichier.
    files: ['**/scripts/**/*.mjs'],
    languageOptions: {
      globals: {
        Buffer: 'readonly',
        WebSocket: 'readonly',
        console: 'readonly',
        fetch: 'readonly',
        process: 'readonly',
      },
    },
  },
  {
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
    },
  },
  prettier,
);

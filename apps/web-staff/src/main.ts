import { createApp } from 'vue';
import { createPinia } from 'pinia';
import { VueQueryPlugin } from '@tanstack/vue-query';
import App from './App.vue';
import { router } from './router';
import { queryClient } from './lib/queryClient';
import './styles/main.css';

createApp(App).use(createPinia()).use(router).use(VueQueryPlugin, { queryClient }).mount('#app');

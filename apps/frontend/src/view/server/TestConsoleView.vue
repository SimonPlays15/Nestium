<script lang="ts" setup>
import {computed} from 'vue'
import {useRoute} from 'vue-router'
import Console from '@/components/server/Console.vue'

const route = useRoute()
const serverId = computed(() => route.params.serverId as string || 'a54ff461-774a-4ee5-975e-d18d9f8998c4')
</script>

<template>
  <Console :serverId="serverId"/>
</template>

<style scoped></style>

<script setup lang="ts">
import { ref } from 'vue'
import { useRoute } from 'vue-router'
import { ChevronDown } from '@lucide/vue'

interface NavItem {
  label: string
  path: string
}

interface NavGroup {
  label: string
  icon: typeof ChevronDown
  prefix: string
  items: NavItem[]
}

const props = defineProps<{ groups: NavGroup[] }>()

const route = useRoute()

const expandedGroups = ref<Set<string>>(new Set())

function getGroupKey(group: NavGroup): string {
  return group.prefix
}

function isGroupActive(group: NavGroup): boolean {
  return route.path.startsWith(group.prefix) || route.path === group.prefix
}

function isGroupExpanded(group: NavGroup): boolean {
  const key = getGroupKey(group)
  return expandedGroups.value.has(key) || isGroupActive(group)
}

function toggleGroup(group: NavGroup) {
  const key = getGroupKey(group)
  if (expandedGroups.value.has(key)) {
    expandedGroups.value.delete(key)
  } else {
    expandedGroups.value.add(key)
  }
}

function isItemActive(path: string): boolean {
  return route.path === path
}
</script>

<template>
  <nav class="flex-1 p-2" role="navigation" aria-label="工作空间">
    <div v-for="group in props.groups" :key="group.prefix" class="mb-0.5">
      <button
        class="w-full flex items-center gap-2.5 px-3 py-2 rounded-md text-sm transition-colors"
        :class="isGroupActive(group) ? 'text-primary font-medium' : 'text-text-secondary hover:text-primary hover:bg-subtle'"
        @click="toggleGroup(group)"
      >
        <component :is="group.icon" :size="16" />
        <span class="flex-1 text-left">{{ group.label }}</span>
        <ChevronDown
          :size="14"
          class="transition-transform"
          :class="isGroupExpanded(group) ? '' : '-rotate-90'"
        />
      </button>
      <div v-if="isGroupExpanded(group)" class="ml-4 mt-0.5 space-y-0.5 border-l border-border pl-2">
        <router-link
          v-for="item in group.items"
          :key="item.path"
          :to="item.path"
          class="block px-3 py-1.5 rounded-md text-xs transition-colors"
          :class="isItemActive(item.path) ? 'text-primary bg-primary-subtle font-medium' : 'text-text-secondary hover:text-primary hover:bg-subtle'"
        >
          {{ item.label }}
        </router-link>
      </div>
    </div>
  </nav>
</template>

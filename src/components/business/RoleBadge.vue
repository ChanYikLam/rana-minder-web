<script setup lang="ts">
import { computed } from 'vue'
import { useWorkspaceContextStore } from '@/state/workspaceContextStore'
import { useStateView } from '@/composables/useStateView'
import StatusBadge from '@/components/common/StatusBadge.vue'

type BadgeVariant = 'success' | 'danger' | 'warning' | 'info' | 'neutral' | 'selected'

const workspace = useWorkspaceContextStore()
const { roleLabel, roleColor } = useStateView()

const currentRoleLabel = computed(() =>
  workspace.currentRole ? roleLabel(workspace.currentRole) : ''
)
const currentRoleColor = computed<BadgeVariant>(() =>
  workspace.currentRole ? (roleColor(workspace.currentRole) as BadgeVariant) : 'neutral'
)
</script>

<template>
  <div class="flex items-center gap-2">
    <StatusBadge
      v-if="workspace.currentRole"
      :variant="currentRoleColor"
      :label="currentRoleLabel"
    />
    <span v-if="workspace.currentClubName" class="text-sm text-text-secondary">
      {{ workspace.currentClubName }}
    </span>
  </div>
</template>

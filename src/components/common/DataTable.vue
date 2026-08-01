<script setup lang="ts">
import { computed, getCurrentInstance, ref, watch } from 'vue'

interface Column<T> {
  key: string
  label: string
  width?: string
  render?: (row: T) => string
}

interface Props {
  columns: Column<unknown>[]
  rows: unknown[]
  loading?: boolean
  emptyTitle?: string
  emptyDescription?: string
  selectable?: boolean
  selectedIds?: string[]
  rowKey?: string
}

const props = withDefaults(defineProps<Props>(), {
  loading: false,
  emptyTitle: '暂无数据',
  emptyDescription: '',
  selectable: false,
  selectedIds: () => [],
  rowKey: 'id',
})

const emit = defineEmits<{
  'update:selectedIds': [ids: string[]]
  rowClick: [row: unknown]
}>()

const slots = useSlots()
const instance = getCurrentInstance()
const localSelected = ref<Set<string>>(new Set(props.selectedIds))
const rowIds = computed(() => props.rows.map(getRowId))
const allRowsSelected = computed(() => rowIds.value.length > 0 && rowIds.value.every((id) => localSelected.value.has(id)))
const hasRowClickListener = computed(() => Boolean(instance?.vnode.props?.onRowClick))

watch(() => props.selectedIds, (ids) => {
  localSelected.value = new Set(ids)
})

function toggleRow(id: string) {
  if (localSelected.value.has(id)) {
    localSelected.value.delete(id)
  } else {
    localSelected.value.add(id)
  }
  emit('update:selectedIds', [...localSelected.value])
}

function toggleAll() {
  if (props.loading || rowIds.value.length === 0) return

  if (allRowsSelected.value) {
    rowIds.value.forEach((id) => localSelected.value.delete(id))
  } else {
    rowIds.value.forEach((id) => localSelected.value.add(id))
  }
  emit('update:selectedIds', [...localSelected.value])
}

function getRowId(row: unknown): string {
  return String((row as Record<string, unknown>)[props.rowKey] || '')
}

function renderCell(col: Column<unknown>, row: unknown): string {
  if (col.render) return col.render(row)
  return String((row as Record<string, unknown>)[col.key] ?? '')
}

function handleRowClick(row: unknown) {
  if (hasRowClickListener.value) emit('rowClick', row)
}
</script>

<template>
  <div class="w-full overflow-x-auto rounded-lg border border-border">
    <table class="w-full text-sm" role="table">
      <thead class="bg-subtle border-b border-border" role="rowgroup">
        <tr role="row">
          <th v-if="selectable" class="w-10 px-3 py-2.5" scope="col">
            <input
              type="checkbox"
              class="rounded border-border"
              :checked="allRowsSelected"
              :disabled="loading || rows.length === 0"
              :aria-label="allRowsSelected ? '取消全选' : '全选'"
              @change="toggleAll"
            />
          </th>
          <th
            v-for="col in columns"
            :key="col.key"
            :style="col.width ? { width: col.width } : {}"
            class="px-3 py-2.5 text-left font-medium text-text-secondary whitespace-nowrap"
            scope="col"
          >
            {{ col.label }}
          </th>
        </tr>
      </thead>
      <tbody role="rowgroup">
        <!-- Loading skeleton rows -->
        <template v-if="loading">
          <tr v-for="i in 5" :key="`skeleton-${i}`" role="row">
            <td v-if="selectable" class="px-3 py-2.5"><div class="h-4 bg-muted rounded animate-pulse" /></td>
            <td v-for="col in columns" :key="col.key" class="px-3 py-2.5">
              <div class="h-4 bg-muted rounded animate-pulse" />
            </td>
          </tr>
        </template>

        <!-- Empty state -->
        <tr v-else-if="rows.length === 0" role="row">
          <td :colspan="columns.length + (selectable ? 1 : 0)" class="px-3 py-12 text-center text-text-secondary">
            <p class="font-medium">{{ emptyTitle }}</p>
            <p v-if="emptyDescription" class="text-xs mt-1">{{ emptyDescription }}</p>
          </td>
        </tr>

        <!-- Data rows -->
        <template v-else>
          <tr
            v-for="row in rows"
            :key="getRowId(row)"
            class="border-b border-border last:border-0 hover:bg-subtle transition-colors"
            :class="hasRowClickListener ? 'cursor-pointer' : ''"
            :tabindex="hasRowClickListener ? 0 : undefined"
            role="row"
            @click="handleRowClick(row)"
            @keydown.enter="handleRowClick(row)"
            @keydown.space.prevent="handleRowClick(row)"
          >
            <td v-if="selectable" class="px-3 py-2.5" @click.stop>
              <input
                type="checkbox"
                class="rounded border-border"
                :checked="localSelected.has(getRowId(row))"
                :aria-label="`选择行`"
                @change="toggleRow(getRowId(row))"
              />
            </td>
            <td
              v-for="col in columns"
              :key="col.key"
              class="px-3 py-2.5 text-primary whitespace-nowrap"
              role="cell"
            >
              <slot :name="`cell-${col.key}`" :row="row" :column="col">
                {{ renderCell(col, row) }}
              </slot>
            </td>
          </tr>
        </template>
      </tbody>
    </table>
  </div>
</template>

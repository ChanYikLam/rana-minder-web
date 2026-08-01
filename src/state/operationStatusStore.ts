import { defineStore } from 'pinia'
import { ref } from 'vue'

export const useOperationStatusStore = defineStore('operationStatus', () => {
  const pendingOperations = ref<Map<string, { action: string; startedAt: number }>>(new Map())
  const lastOperationResult = ref<{ success: boolean; message: string } | null>(null)

  function startOperation(idempotencyKey: string, action: string) {
    pendingOperations.value.set(idempotencyKey, { action, startedAt: Date.now() })
  }

  function finishOperation(idempotencyKey: string, success: boolean, message: string) {
    pendingOperations.value.delete(idempotencyKey)
    lastOperationResult.value = { success, message }
  }

  function isOperationPending(idempotencyKey: string): boolean {
    return pendingOperations.value.has(idempotencyKey)
  }

  function clearLastResult() {
    lastOperationResult.value = null
  }

  return {
    pendingOperations,
    lastOperationResult,
    startOperation,
    finishOperation,
    isOperationPending,
    clearLastResult,
  }
})

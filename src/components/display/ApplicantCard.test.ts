import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import { pageStubs } from '@/test-utils/pageStubs'
import ApplicantCard from './ApplicantCard.vue'

const applicant = {
  id: 'app-1', name: '张三', studentId: '20240001',
  status: 'submitted', preferences: [], appliedAt: '2026-08-01T04:00:00Z',
}

describe('ApplicantCard 申请人卡片', () => {
  it('渲染姓名、学号与状态标签', () => {
    const wrapper = mount(ApplicantCard, { props: { applicant }, global: { stubs: pageStubs } })
    expect(wrapper.text()).toContain('张三')
    expect(wrapper.text()).toContain('20240001')
    expect(wrapper.text()).toContain('已提交')
  })

  it('未知状态回退原始值', () => {
    const wrapper = mount(ApplicantCard, { props: { applicant: { ...applicant, status: 'weird' } }, global: { stubs: pageStubs } })
    expect(wrapper.text()).toContain('weird')
  })
})

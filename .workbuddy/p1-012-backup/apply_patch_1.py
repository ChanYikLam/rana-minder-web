# -*- coding: utf-8 -*-
"""P1-012 补丁应用脚本（种子数据部分）"""
import io

p = r'D:\liudawenjian\Desktop\test1\src\mock\db-recruitment.ts'
s = io.open(p, encoding='utf-8').read()

# 1. 种子 paths 加 labelHistory: []
replacements = [
    (
        "'dept-001': { departmentId: 'dept-001', departmentName: '技术部', order: 1, source: 'volunteer', status: 'evaluating', decided: null, labelSetBy: null, waitlist: false, holdDeadline: null, publishedAt: null, version: 1 },",
        "'dept-001': { departmentId: 'dept-001', departmentName: '技术部', order: 1, source: 'volunteer', status: 'evaluating', decided: null, labelSetBy: null, waitlist: false, holdDeadline: null, publishedAt: null, labelHistory: [], version: 1 },",
    ),
    (
        "'dept-003': { departmentId: 'dept-003', departmentName: '设计部', order: 2, source: 'volunteer', status: 'pending', decided: null, labelSetBy: null, waitlist: false, holdDeadline: null, publishedAt: null, version: 1 },",
        "'dept-003': { departmentId: 'dept-003', departmentName: '设计部', order: 2, source: 'volunteer', status: 'pending', decided: null, labelSetBy: null, waitlist: false, holdDeadline: null, publishedAt: null, labelHistory: [], version: 1 },",
    ),
    (
        "'dept-002': { departmentId: 'dept-002', departmentName: '运营部', order: 1, source: 'volunteer', status: 'evaluating', decided: null, labelSetBy: null, waitlist: false, holdDeadline: null, publishedAt: null, version: 1 },",
        "'dept-002': { departmentId: 'dept-002', departmentName: '运营部', order: 1, source: 'volunteer', status: 'evaluating', decided: null, labelSetBy: null, waitlist: false, holdDeadline: null, publishedAt: null, labelHistory: [], version: 1 },",
    ),
    (
        "'dept-001': { departmentId: 'dept-001', departmentName: '技术部', order: 1, source: 'volunteer', status: 'waitlist', decided: null, labelSetBy: '李思颖', waitlist: true, holdDeadline: null, publishedAt: null, version: 2 },",
        "'dept-001': { departmentId: 'dept-001', departmentName: '技术部', order: 1, source: 'volunteer', status: 'waitlist', decided: null, labelSetBy: '李思颖', waitlist: true, holdDeadline: null, publishedAt: null, labelHistory: [], version: 2 },",
    ),
    (
        "'dept-002': { departmentId: 'dept-002', departmentName: '运营部', order: 1, source: 'volunteer', status: 'published', decided: 'not_admit', labelSetBy: null, waitlist: false, holdDeadline: null, publishedAt: daysFromNow(-28), version: 2 },",
        "'dept-002': { departmentId: 'dept-002', departmentName: '运营部', order: 1, source: 'volunteer', status: 'published', decided: 'not_admit', labelSetBy: null, waitlist: false, holdDeadline: null, publishedAt: daysFromNow(-28), labelHistory: [], version: 2 },",
    ),
]

for old, new in replacements:
    cnt = s.count(old)
    print('path replace count:', cnt)
    s = s.replace(old, new)

# 2. 种子 applications 加 eligibilitySnapshot: null（5 处 'identityAnomalyAt: null,\n    version: 1,' 模式）
pattern = "identityAnomalyAt: null,\n    version: 1,"
cnt = s.count(pattern)
print('seed apps identityAnomaly pattern count:', cnt)
s = s.replace(pattern, "identityAnomalyAt: null, eligibilitySnapshot: null,\n    version: 1,")

io.open(p, 'w', encoding='utf-8', newline='').write(s)
print('done')

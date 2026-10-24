import assert from 'node:assert/strict'
import { renderSvg } from './engine.ts'
import { flowchartSampleJson } from '../src/data/mockData.ts'

// The longer rejection path must not steal the affirmative branch's main axis.
const svg = await renderSvg({
  type: 'flowchart',
  nodes: [
    { id: 'd', type: 'decision', label: '是否通过' },
    { id: 'yes', type: 'process', label: '通过' },
    { id: 'no', type: 'process', label: '拒绝' },
    { id: 'retry', type: 'process', label: '重新填写' },
  ],
  edges: [
    { source: 'd', target: 'no', label: '否' },
    { source: 'no', target: 'retry' },
    { source: 'd', target: 'yes', label: '是' },
    { source: 'retry', target: 'd' },
  ],
})
const center = (id: string) => {
  const match = svg.match(new RegExp(`class="flow-node-label" data-node-id="${id}" x="([^"]+)"`))
  assert.ok(match, `Missing label: ${id}`)
  return Number(match[1])
}
assert.equal(center('d'), center('yes'))
assert.notEqual(center('d'), center('no'))
assert.match(svg, /class="flow-edge flow-edge-back" data-from="retry" data-to="d"/)

const sample = JSON.parse(flowchartSampleJson)
assert.equal(sample.edges.find((edge: { id: string }) => edge.id === 'login_e5').target, 'login_input')
const sampleSvg = await renderSvg({ ...sample, type: 'flowchart' })
assert.match(sampleSvg, /class="flow-edge flow-edge-back" data-from="login_error" data-to="login_input"/)
const labelPosition = (id: string) => {
  const match = sampleSvg.match(new RegExp(`class="flow-node-label" data-node-id="${id}" x="([^"]+)" y="([^"]+)"`))
  assert.ok(match, `Missing label: ${id}`)
  return { x: Number(match[1]), y: Number(match[2]) }
}
assert.equal(labelPosition('login_check').y, labelPosition('login_error').y)
assert.equal(labelPosition('login_check').x, labelPosition('login_home').x)
const branchPath = sampleSvg.match(/data-from="login_check" data-to="login_error" d="([^"]+)"/)
assert.ok(branchPath)
assert.equal((branchPath[1].match(/ L /g) || []).length, 1, 'Error branch must be a straight line')
const returnPath = sampleSvg.match(/data-from="login_error" data-to="login_input" d="([^"]+)"/)
assert.ok(returnPath)
assert.equal((returnPath[1].match(/ L /g) || []).length, 2, 'Retry must have only one bend')
console.log('PASS affirmative main axis, retry loop, horizontal error branch, and compact return path')

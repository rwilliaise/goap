/// <reference types="@rbxts/testez/globals" />

import { AgentAction } from 'action'
import { Agent } from 'agent'

let actionFired = false

class TestAction extends AgentAction {
  requiredRange: number = math.huge
  cost = 0
  /**
   *
   */
  constructor(agent: Agent) {
    super(agent)
    this.preconditions.set('t', true)
  }
  perform(): void {
    actionFired = true
  }
  clone(): AgentAction {
    return new TestAction(this.agent).setClone(this.id)
  }
}

class TestAgent extends Agent {
  awake() {
    this.addAction(new TestAction(this))
  }
}

export = function () {
  const agentPart = new Instance('Part')
  const agentBody = new Instance('Model')
  agentBody.PrimaryPart = agentPart
  const agent = new TestAgent(agentBody)
  agent.start()
  // describe('.start()', () => {
  //   const agentPart = new Instance('Part')
  //   const agentBody = new Instance('Model')
  //   agentBody.PrimaryPart = agentPart
  //   const agent = new TestAgent(agentBody)
  //   it('should not error on start', () => {
  //     expect(agent.start()).to.never.throw()
  //   })

  //   it('should wake the agent', () => {
  //     expect(agent.isAwake).to.equal(true)
  //   })
  // })

  // describe('.runningThread', () => {
  //   const agentPart = new Instance('Part')
  //   const agentBody = new Instance('Model')
  //   agentBody.PrimaryPart = agentPart
  //   const agent = new TestAgent(agentBody)
  //   it('should start with no thread', () => {
  //     expect(agent.runningThread).to.equal(/* RunningThread.NONE */ 0)
  //   })
  // })

  describe('.fixedUpdate()', () => {
    it('should add the TestAction', () => {
      expect(agent._addActions()).to.equal(true)
    })

    agent.fixedUpdate(0.03)

    it('should start a new thread', () => {
      expect(agent.runningThread).to.never.equal(/* RunningThread.NONE */ 0)
    })
  })
}

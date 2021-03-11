import { AgentAction } from 'action'
import { DataSet } from 'agent'

export class AgentGoal {
  children: AgentAction[] = []

  constructor(public key: string, public multiplier = 1) {}

  setChildren(children: AgentAction[]) {
    this.children = children
  }

  /**
   * Update the multiplier based on outside factors, such as how many times a
   * certain player has killed the agent.
   *
   * By default, this is empty. Implement it to change this behavior.
   */
  updateMultiplier(data: DataSet) {}

  update(data: DataSet) {
    this.updateMultiplier(data)
  }
}

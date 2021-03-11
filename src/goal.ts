import { AgentAction } from 'action'

export class AgentGoal {
  children: AgentAction[] = []

  constructor(public key: string, public multiplier = 1) {}

  setChildren(children: AgentAction[]) {
    this.children = children
  }
}

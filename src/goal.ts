import { AgentAction } from 'action'
import { DataSet } from 'agent'

export class AgentGoal {
  children: AgentAction[] = []
  cheapestChildren: AgentAction[] = []
  cheapestCost: number = math.huge

  constructor(public key: string, public multiplier = 1) {}

  /**
   * Calculates the cheapest branch for this goal
   * @param cheapest The cheapest branch
   * @returns The cheapest cost
   */
  getTotalCost(cheapest?: AgentAction[]): [number, AgentAction[] | undefined] {
    cheapest = undefined
    this.cheapestCost = math.huge
    let totalActions: AgentAction[] | undefined = undefined
    let totalCost = 0

    for (const child of this.children) {
      ;[totalCost, totalActions] = child.getTotalCost(totalActions)

      if (totalCost < this.cheapestCost) {
        if (totalActions !== undefined) {
          cheapest = totalActions
        }
        this.cheapestCost = totalCost
      }
    }

    return [
      cheapest !== undefined ? this.cheapestCost * this.multiplier : math.huge,
      cheapest
    ]
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

    for (const child of this.children) {
      child.update(data)
    }
  }
}

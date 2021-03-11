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
  getTotalCost(cheapest: AgentAction[]) {
    cheapest.clear()
    this.cheapestCost = math.huge
    const totalActions: AgentAction[] = []
    let totalCost = 0

    for (const child of this.children) {
      totalCost = child.getTotalCost(totalActions)

      if (totalCost < this.cheapestCost) {
        if (totalActions.size() > 0) {
          totalActions.forEach((value) => cheapest.push(value))
        }
        this.cheapestCost = totalCost
      }
    }

    return cheapest.size() > 0 ? this.cheapestCost * this.multiplier : math.huge
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

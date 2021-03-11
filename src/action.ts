import { Agent } from 'agent'

export abstract class AgentAction {
  childs: AgentAction[] = []
  /** Last position agent was in, cached */
  agentPosition: Vector3 = new Vector3()
  /** Should this action get removed when no target has been found? */
  removeWhenTargetless = false

  /** Current position of this action */
  position: Vector3 = new Vector3()

  /** Cached check for preconditions */
  preconditionsValid = false
  /** Cached check for procedural preconditions */
  proceduralConditionsValid = false

  /**
   * The distance between this action's target and the next action's target
   * will be multiplied by this.
   */
  distanceMultiplier = 1

  /** Cached distance to the action before. */
  distance = 0

  cheapestChilds?: AgentAction[]
  cheapestCost = 0
  cost = 0

  isRunning = false

  constructor(public agent: Agent, public delay = 1) {}

  getDepth() {
    if (this.childs.size() > 0) {
      let deepest = 0

      for (const child of this.childs) {
        const childDepth = child.getDepth()
        if (childDepth > deepest) {
          deepest = childDepth
        }
      }

      return deepest + 1
    } else {
      return 0
    }
  }

  /**
   * Get the total cost of the cheapest branch of this action and it's tree.
   * Outputs a list containing the cheapest actions to perform this action
   *
   * @param cheapestObject
   * Since references are not available in TS, I have to resort to an object.
   * Please supply an empty object. Please.
   */
  getTotalCost(cheapestObject: { cheapest?: AgentAction[] }): number {
    cheapestObject.cheapest = undefined
    this.cheapestCost = math.huge
    let totalCost = 0

    if (this.proceduralConditionsValid && !this.preconditionsValid) {
      const totalActions: AgentAction[] | undefined = undefined

      for (const child of this.childs) {
        if (!child.proceduralConditionsValid) {
          continue
        }

        child.distance = this.distanceToChild(child)
        totalCost = child.distance + child.getTotalCost(cheapestObject)

        if (totalCost < this.cheapestCost) {
          if (totalActions !== undefined) {
            cheapestObject.cheapest = totalActions
            cheapestObject.cheapest!.push(this)
          } else {
            cheapestObject.cheapest = totalActions
          }
        }
      }
    }

    // no more valid child actions
    if (cheapestObject.cheapest === undefined) {
      // we have found the winning action!
      if (this.proceduralConditionsValid && this.preconditionsValid) {
        cheapestObject.cheapest = []
        cheapestObject.cheapest!.push(this)

        this.cheapestChilds = cheapestObject.cheapest
        return this.cost + this.agentPosition.sub(this.position).Magnitude
      } else {
      }
    }

    return this.cost + this.cheapestCost
  }

  distanceToChild(child: AgentAction) {
    return child.position.sub(this.position).Magnitude
  }

  setDistance(distance: number) {}

  getDistance() {}

  onStart() {
    this.isRunning = true
  }

  onStop() {
    this.isRunning = false
  }

  abstract perform(): void
}

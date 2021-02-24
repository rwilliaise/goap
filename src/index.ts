import { PathfindingService } from "@rbxts/services";

interface Node {
	parent?: Node;
	runningCost: number;
	runningState: WorldState;
	currentAction?: Action;
}

type WorldState = Map<string, unknown>;
type FiniteState = (actor: Actor) => void;

class StateMachine {
	public stack: FiniteState[] = [];
	public actor: Actor;

	public constructor(actor: Actor) {
		this.actor = actor;
	}

	update() {
		const func = this.stack[this.stack.size()];
		func(this.actor);
	}

	push(func: FiniteState) {
		this.stack.push(func);
	}

	pop() {
		this.stack.pop();
	}
}

/**
 * Used by the planner to set a concrete goal that the AI should go after.
 */
export abstract class Goal {
	/**
	 * Checks if a goal should be pursued.
	 *
	 * @param state State that the Goal should check against.
	 */
	abstract isValid(state: WorldState): boolean;

	/**
	 * Checks if a state reaches the given goal.
	 *
	 * @param state State that the Goal should check.
	 */
	abstract reachedGoal(state: WorldState): boolean;

	// TODO: probably should implement this system one of these days

	/*
	 * Used to bias the planner towards some goals instead of others. The weight
	 * of a given Goal is procedurally produced, based on the current state. This
	 * allows the planner to plan more dynamically than if it were a fixed cost.
	 *
	 * Currently, this is not implemented. Hopefully, this will be implemented.
	 *
	 * @param state Given state that the Goal should assess.
	 */
	// abstract getWeight(state: WorldState): number;
}

/**
 * Actions are used alongside other Actions to reach a given goal.
 */
export abstract class Action {
	private preconditions: WorldState = new Map();

	/**
	 * Checks whether or not the current world state is valid for this given
	 * action.
	 *
	 * @param state State that the Action should check against.
	 */
	isValid(state: WorldState) {
		for (const [index, value] of this.preconditions) {
			let match = false;
			for (const [otherIndex, otherValue] of state) {
				if (otherIndex === index && otherValue === value) {
					match = true;
				}
			}
			if (!match) {
				// HAS to meet ALL preconditions, or fails
				return false;
			}
		}
		return this.checkProceduralPreconditions(state);
	}

	/**
	 * Invoked after all constant preconditions are checked. This flags whether
	 * or not a given state is good for this given action.
	 *
	 * @param state State to check against.
	 */
	checkProceduralPreconditions(state: WorldState) {
		return true;
	}

	/**
	 * Sets a given state to be a precondition.
	 *
	 * @param index Index of given value in the WorldState
	 * @param value Value to be put as a condition.
	 */
	addPrecondition(index: string, value: unknown) {
		this.preconditions.set(index, value);
	}

	/**
	 * Used to get how the given Action will affect the state.
	 *
	 * @param state State that the Action should mutate.
	 */
	abstract populate(state: WorldState): WorldState;

	/**
	 * Perform the given action.
	 */
	abstract perform(actor: Actor): boolean;

	/**
	 * Get the cost of a given state.
	 */
	abstract getCost(): number;

	/**
	 * Used to assess when the Action is done performing.
	 */
	abstract isDone(): boolean;

	/**
	 * Clean up variables and other things within the Action.
	 */
	reset() {
		// nothing to clean up!
	}
}

/**
 * Action that requires the Actor to be at a given target position.
 */
export abstract class MovingAction extends Action {
	public target?: Vector3;
	public inRange = false;

	checkProceduralPreconditions(state: WorldState) {
		const foundTarget = this.findTarget(state);
		if (foundTarget) {
			this.target = foundTarget;
			return true;
		}
		return false;
	}

	reset() {
		this.target = undefined;
		this.inRange = false;
	}

	/**
	 * Tries to find a viable target, and returns the position.
	 *
	 * @param state State to get target from
	 */
	abstract findTarget(state: WorldState): Vector3 | undefined;
}

export class Planner {
	// AI goals and possible actions
	private goals: Goal[] = [];
	private actions: Action[] = [];

	/**
	 * Creates a new plan for the AI to follow.
	 */
	plan(state: WorldState): Action[] {
		this.actions.forEach((value) => {
			value.reset();
		});

		// goals that arent valid at the start of planning probably wont be valid at the end of planning
		// this may be a fallacy but i dont really care LMAO
		const pursuableGoals = this.goals.mapFiltered((value) => {
			return value.isValid(state) ? value : undefined;
		});

		// build the graph, and see if it found a solution
		const [success, leaves] = this.build(this.actions, pursuableGoals, {
			runningCost: 0,
			runningState: state,
		}) as LuaTuple<[boolean, Node[]]>; // typing nonsense, but works :shrug:

		if (!success) {
			// no way to meet any goals, oh well
			return [];
		}

		let cheapestLeaf: Node | undefined = undefined;
		for (const node of leaves) {
			if (!cheapestLeaf) {
				cheapestLeaf = node;
				continue;
			}
			if (node.runningCost < cheapestLeaf!.runningCost) {
				cheapestLeaf = node;
			}
		}

		const out: Action[] = [];
		let node = cheapestLeaf;

		while (node !== undefined) {
			if (node.currentAction) {
				out.insert(0, node.currentAction);
			}
			node = node.parent;
		}

		return out;
	}

	/**
	 * Build an Action graph, with one path being the cheapest.
	 *
	 * @param actions An array of possible actions that the AI could take.
	 */
	private build(
		actions: Action[],
		goals: Goal[],
		parent: Node,
		leaves?: Node[],
	): boolean | LuaTuple<[boolean, Node[]]> {
		const flag = leaves === undefined;
		leaves = leaves || [];

		let found = false;

		// loop through all possible actions, testing to see if this given action will meet any goal.
		for (const action of actions) {
			if (action.isValid(parent!.runningState)) {
				// okay! this action can be done
				const currentState = action.populate(parent!.runningState);
				const node = {
					parent: parent,
					runningCost: parent.runningCost + action.getCost(),
					runningState: currentState,
					currentAction: action,
				};

				// meets ANY goal
				// TODO: allow weighted goals, some are preferred over others
				const meetsGoal = goals.some((value) => {
					return value.reachedGoal(currentState);
				});

				// if it meets literally ANY goal, we are good to go
				// possibly could subtract goal weight from runningCost
				if (meetsGoal) {
					leaves.push(node);
					found = true;
				} else {
					const subset = actions.mapFiltered((value) => {
						return action !== value ? value : undefined;
					});
					found = found || (this.build(subset, goals, node, leaves) as boolean);
				}
			}
		}

		if (flag) {
			return ([found, leaves] as unknown) as LuaTuple<[boolean, Node[]]>;
		}
		return found;
	}

	addAction(action: Action) {
		this.actions.push(action);
	}

	addGoal(goal: Goal) {
		this.goals.push(goal);
	}
}

/**
 * A humanoid that can plan and do those plans accordingly.
 */
export abstract class Actor {
	protected planner: Planner = new Planner();

	protected character: Instance = this.createCharacter();
	protected humanoid: Humanoid = this.character.WaitForChild("Humanoid") as Humanoid;
	protected moving = false;

	protected stack: StateMachine = new StateMachine(this);
	protected currentPlan: Action[] | undefined;

	protected constructor() {
		this.stack.push(this.idle);
	}

	/**
	 * Idle state for the FSM
	 * @param actor Actor to perform the FiniteState on
	 */
	idle = (actor: Actor) => {
		const plan = actor.planner.plan(actor.getState());

		if (plan) {
			actor.currentPlan = plan;

			actor.stack.pop();
			actor.stack.push(actor.perform);
		} else {
			actor.failedPlan();
			actor.stack.pop();
			actor.stack.push(actor.idle);
		}
	};

	/**
	 * Perform action state for the FSM
	 * @param actor Actor to perform the FiniteState on
	 */
	perform = (actor: Actor) => {
		if (actor.currentPlan?.size() === 0) {
			actor.stack.pop();
			actor.stack.push(actor.idle);
			return;
		}

		let action = actor.currentPlan![actor.currentPlan!.size() - 1];

		if (action.isDone()) {
			actor.currentPlan?.pop();
		}

		if (actor.currentPlan!.size() > 0) {
			action = actor.currentPlan![actor.currentPlan!.size() - 1];

			const inRange = action instanceof MovingAction ? action.inRange : true;

			if (inRange) {
				const success = action.perform(actor);

				if (!success) {
					actor.stack.pop();
					actor.stack.push(actor.idle);
				}
			} else {
				actor.stack.push(actor.moveTo);
			}
		} else {
			actor.stack.pop();
			actor.stack.push(actor.idle);
		}
	};

	/**
	 * MoveTo state for the FSM
	 * @param actor Actor to perform the FiniteState on
	 */
	moveTo = (actor: Actor) => {
		if (actor.moving) {
			// since we are already moving, everything is assessed, and thus good to go.
			return;
		}

		const action = actor.currentPlan![actor.currentPlan!.size() - 1] as MovingAction;

		// technically, this shouldn't be possible without major error from the dev
		if (action instanceof MovingAction && action.target === undefined) {
			// no target to go to, just pop move and perform actions
			actor.stack.pop();
			actor.stack.pop();
			actor.stack.push(actor.idle);
			return;
		}

		actor.moving = true;

		actor.move(action.target!).then(() => {
			action.inRange = true;
			actor.moving = false;
			actor.stack.pop();
		});
	};

	/**
	 * Runs the AI, including the current FSM state.
	 */
	update() {
		this.stack.update();
	}

	addAction(action: Action) {
		this.planner.addAction(action);
	}

	addGoal(goal: Goal) {
		this.planner.addGoal(goal);
	}

	/**
	 * Called when a plan fails, or a plan cannot be formulated.
	 */
	failedPlan() {
		// nothing, probably would only use this for debugging
	}

	/**
	 * Create a path object with agent params. By default, it does not have any
	 * params.
	 */
	createPath() {
		return PathfindingService.CreatePath();
	}

	/**
	 * Make the character path to a specific point.
	 *
	 * @param target Position to move to
	 */
	move(target: Vector3) {
		return new Promise<void>((resolve, reject, onCancel) => {
			let cancelled = false;
			onCancel(() => {
				cancelled = true;
			});
			const path = this.createPath();
			path.ComputeAsync((this.character as Model).GetPrimaryPartCFrame().Position, target);
			if (path.Status !== Enum.PathStatus.Success) {
				reject();
				return;
			}

			let blocked = false;

			const connection = path.Blocked.Connect((waypointNum: number) => {
				blocked = true;
				this.move(target).then(() => {
					blocked = false;
				});
				connection.Disconnect();
			});

			for (const waypoint of path.GetWaypoints()) {
				if (cancelled) {
					break;
				}
				if (blocked) {
					while (blocked) {
						if (cancelled) {
							break;
						}
						// stall
					}
					return;
				}
				if (waypoint.Action === Enum.PathWaypointAction.Jump) {
					this.humanoid.Jump = true;
				}
				this.humanoid.MoveTo(waypoint.Position);
				this.humanoid.MoveToFinished.Wait();
			}

			connection.Disconnect();
			resolve();
		});
	}

	/**
	 * Used internally to create the character. Returned instance requires a
	 * Humanoid to be present, or the Actor will stall waiting for it.
	 */
	abstract createCharacter(): Instance;

	/**
	 * Creates a WorldState with variables outside of the Actor.
	 */
	abstract getState(): WorldState;
}

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

export abstract class Action {
	public preconditions: WorldState = new Map();

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

	checkProceduralPreconditions(state: WorldState) {
		return true;
	}

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
	 * Clean up variables and other things within the Action.
	 */
	reset() {
		// nothing to clean up!
	}
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
	private planner: Planner = new Planner();

	private character: Instance = this.createCharacter();
	private humanoid: Humanoid = this.character.WaitForChild("Humanoid") as Humanoid;

	private stack: StateMachine = new StateMachine(this);
	private currentPlan: Action[] | undefined;

	public constructor() {
		this.stack.push(this.idle);
	}

	idle = (actor: Actor) => {
		const plan = actor.planner.plan(actor.getState());

		// if (plan) {

		// }
	};

	perform = (actor: Actor) => { };

	moveTo = (actor: Actor) => { };

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
	 * Used internally to create the character. Returned instance requires a
	 * Humanoid to be present, or the Actor will stall waiting for it.
	 */
	abstract createCharacter(): Instance;

	/**
	 * Creates a WorldState with variables outside of the Actor.
	 */
	abstract getState(): WorldState;
}

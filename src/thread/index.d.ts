declare namespace Thread {
  /**
   * @param t Time for thread to wait
   * @returns Delay time, elasped time
   */
  export function Wait(
    this: typeof Thread,
    t: number
  ): LuaTuple<[number, number]>

  /**
   * @param func Function to be spawned
   * @param args Arguments passed to the function
   */
  export function Spawn<T extends unknown[]>(
    this: typeof Thread,
    func: (...args: LuaTuple<T>) => unknown,
    ...args: T
  ): void

  /**
   * @param t Time to delay the function
   * @param callback Function to be called after the delay
   */
  export function Delay(
    this: typeof Thread,
    t: number,
    callback: (delayTime: number, elapsed: number) => unknown
  ): void
}

export = Thread

export interface MockMethod {
  url: string
  method: string
  response: (options: any) => any
  rawResponse?: (req: any, res: any) => void | Promise<void>
}

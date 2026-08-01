export interface MockMethod {
  url: string
  method: string
  response: (options: any) => any
}

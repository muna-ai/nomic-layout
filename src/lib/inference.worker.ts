import * as methods from "./inference"
import { workerDispatch } from "./worker-proxy"

workerDispatch(methods);
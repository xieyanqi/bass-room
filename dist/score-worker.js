import {readTabImage} from "./score-reader.js";

self.onmessage = ({data}) => {
  try {
    self.postMessage(readTabImage(data));
  } catch (error) {
    self.postMessage({error: error.message});
  }
};

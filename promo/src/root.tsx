import { Composition } from 'remotion'
import { TopNotePromo } from './TopNotePromo'
import { TopNoteAstra } from './TopNoteAstra'
import { DURATION, FPS, WIDTH, HEIGHT } from './storyboard'

export const Root = () => <>
  <Composition id="TopNoteAstra" component={TopNoteAstra} durationInFrames={DURATION} fps={FPS} width={WIDTH} height={HEIGHT}/>
  <Composition id="TopNotePromo" component={TopNotePromo} durationInFrames={900} fps={30} width={1600} height={900}/>
</>

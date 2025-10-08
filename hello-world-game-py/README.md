# Module hello-world-game-py

A computer vision-based object detection game module that implements a button component with game logic. Players press the button to start a new game round where they must find and detect specific objects using a camera and object detection service.

## Model naomi:hello-world-game-py:game-logic

A button component that implements an interactive object detection game. When pressed, it starts a new game round where players have 60 seconds to detect a randomly selected object using computer vision. The game tracks score and provides real-time feedback through logging.

### Configuration
The following attribute template can be used to configure this model:

```json
{
  "camera_name": "<string>",
  "detector_name": "<string>"
}
```

#### Attributes

The following attributes are available for this model:

| Name             | Type   | Inclusion | Description                                    |
|------------------|--------|-----------|------------------------------------------------|
| `camera_name`    | string | Required  | Name of the camera component to use for detection |
| `detector_name`  | string | Required  | Name of the vision service detector to use for object detection |

#### Example Configuration

```json
{
  "camera_name": "camera-1",
  "detector_name": "object-detector"
}
```

### DoCommand

This model implements DoCommand with the following supported commands:

#### Example DoCommand

```json
{
  "action": "run_game_loop"
}
```

**Command Details:**
- `action`: Set to `"run_game_loop"` to execute one iteration of the game logic
- Returns current game state including:
  - `score`: Current score (number of successful detections)
  - `time_round_start`: Timestamp when current round started
  - `item_to_detect`: Current object the player needs to find

#### Game Logic Flow

1. **Button Press**: When the button is pressed (`push` method), it sets `new_game = True`
2. **Game Start**: Next `run_game_loop` call initializes a new game:
   - Resets score to 0
   - Selects a random object
   - Starts 60-second timer
3. **Detection Loop**: During active game:
   - Captures image from configured camera
   - Runs object detection using configured detector
   - Checks if target object is detected with >50% confidence
   - On successful detection: increments score and starts new round
4. **Game End**: After 60 seconds, game ends and logs final score


import asyncio
import random
from datetime import datetime, timedelta

from typing import (Any, ClassVar, Dict, Final, List, Mapping, Optional,
                    Sequence, Tuple, cast)

from typing_extensions import Self
from viam.components.button import *
from viam.components.camera import *
from viam.components.component_base import ComponentBase
from viam.proto.app.robot import ComponentConfig
from viam.proto.common import Geometry, ResourceName
from viam.resource.base import ResourceBase
from viam.resource.easy_resource import EasyResource
from viam.resource.types import Model, ModelFamily
from viam.services.vision import *
from viam.utils import ValueTypes


class GameLogic(Button, EasyResource):
    # To enable debug-level logging, either run viam-server with the --debug option,
    # or configure your resource/machine to display debug logs.
    MODEL: ClassVar[Model] = Model(
        ModelFamily("naomi", "hello-world-game-py"), "game-logic"
    )

    POSSIBLE_OPTIONS: ClassVar[List[str]] = [
        "Person", "Cat", "Dog", "Hat", "Backpack", "Umbrella", "Shoe",
        "Eye glasses", "Handbag", "Tie", "Suitcase", "Frisbee", "Sportsball",
        "Plate", "Cup", "Fork", "Knife", "Spoon", "Bowl", "Banana", "Apple",
        "Sandwich", "Orange", "Broccoli", "Carrot", "Pizza", "Donut", "Cake",
        "Chair", "Couch", "Potted plant", "Mirror", "Desk", "Door", "Tv",
        "Laptop", "Mouse", "Keyboard", "Cellphone", "Blender", "Book", "Clock",
        "Vase", "Scissors", "Teddy bear", "Hair drier", "Toothbrush",
        "Hair brush"
    ]

    @classmethod
    def new(
        cls, config: ComponentConfig, dependencies: Mapping[ResourceName, ResourceBase]
    ) -> Self:
        """This method creates a new instance of this Button component.
        The default implementation sets the name from the `config` parameter and then calls `reconfigure`.

        Args:
            config (ComponentConfig): The configuration for this resource
            dependencies (Mapping[ResourceName, ResourceBase]): The dependencies (both required and optional)

        Returns:
            Self: The resource
        """
        return super().new(config, dependencies)

    @classmethod
    def validate_config(
        cls, config: ComponentConfig
    ) -> Tuple[Sequence[str], Sequence[str]]:
        req_deps = []
        fields = config.attributes.fields
        if "camera_name" not in fields:
            raise Exception("missing required camera_name attribute")
        elif not fields["camera_name"].HasField("string_value"):
            raise Exception("camera_name must be a string")
        camera_name = fields["camera_name"].string_value
        if not camera_name:
            raise ValueError("camera_name cannot be empty")
        req_deps.append(camera_name)
        if "detector_name" not in fields:
            raise Exception("missing required detector_name attribute")
        elif not fields["detector_name"].HasField("string_value"):
            raise Exception("detector_name must be a string")
        detector_name = fields["detector_name"].string_value
        if not detector_name:
            raise ValueError("detector_name cannot be empty")
        req_deps.append(detector_name)
        return req_deps, []

    def reconfigure(
        self, config: ComponentConfig, dependencies: Mapping[ResourceName, ResourceBase]
    ):
        # Game state
        self.new_game: bool = False
        self.score: int = 0
        self.time_round_start: Optional[datetime] = None
        self.item_to_detect: str = ""

        # Runtime control
        self.running: Optional[bool] = None
        self.event: asyncio.Event = asyncio.Event()
        self.task: Optional[asyncio.Task] = None

        camera_name = config.attributes.fields["camera_name"].string_value
        detector_name = config.attributes.fields["detector_name"].string_value

        # Get the resource name for the vision service
        vision_resource_name = VisionClient.get_resource_name(detector_name)

        # Check if the vision resource exists in dependencies
        if vision_resource_name not in dependencies:
            raise KeyError(f"Vision service '{detector_name}' not found in dependencies. Available resources: {list(dependencies.keys())}")

        vision_resource = dependencies[vision_resource_name]
        self.detector = cast(VisionClient, vision_resource)
        self.camera_name = camera_name

        # Start the game loop if not already running
        if self.task is None:
            self.start()
        else:
            self.logger.info("Game loop already running.")

        return super().reconfigure(config, dependencies)

    def start(self):
        if self.task is None:
            loop = asyncio.get_running_loop()
            self.task = loop.create_task(self._game_loop())
            self.event.clear()
            self.logger.info("Game loop started.")

    def stop(self):
        self.event.set()
        if self.task is not None:
            self.task.cancel()
            self.task = None
        self.logger.info("Game loop stopped.")

    async def close(self):
        self.stop()

    async def _game_loop(self):
        try:
            while not self.event.is_set():
                await self._process_game_state()
                await asyncio.sleep(1)
        except asyncio.CancelledError:
            self.logger.info("Game loop cancelled.")
        except Exception as e:
            self.logger.error(f"Game loop error: {e}")
        finally:
            self.task = None

    async def _process_game_state(self):
        try:
            if self.new_game:
                await self._start_new_game()
            if self._is_game_active():
                await self._check_for_detection()
            else:
                await self._handle_game_end()

        except Exception as err:
            self.logger.error(f"Game state processing error: {err}")

    async def _start_new_game(self):
        """Initialize a new game round."""
        self.new_game = False
        self.logger.info("Game is starting.")
        self.time_round_start = datetime.now()
        self.logger.info(f"Round started at {self.time_round_start.strftime('%Y-%m-%d %H:%M:%S')}")

        self.score = 0
        self.item_to_detect = random.choice(self.POSSIBLE_OPTIONS)
        self.logger.info(f"Item to detect: {self.item_to_detect}")

    def _is_game_active(self) -> bool:
        if not self.time_round_start:
            return False

        # Check if the current round is still active (within 60 seconds).
        return datetime.now() - self.time_round_start <= timedelta(seconds=60)

    async def _check_for_detection(self):
        self.logger.info("Checking for item detection")

        detections = await self.detector.get_detections_from_camera(self.camera_name)

        if self._is_target_detected(detections):
            await self._handle_successful_detection()
        else:
            self.logger.info(f"Item not detected: {self.item_to_detect}")

    def _is_target_detected(self, detections) -> bool:
        for detection in detections:
            if (detection.class_name == self.item_to_detect and
                detection.confidence > 0.5):
                return True
        return False

    async def _handle_successful_detection(self):
        self.score += 1
        self.logger.info(f"Item detected: {self.item_to_detect}")
        self.logger.info(f"Score: {self.score}")

        await self._start_new_round()

    async def _start_new_round(self):
        self.time_round_start = datetime.now()
        self.logger.info(f"Starting new round at {self.time_round_start.strftime('%Y-%m-%d %H:%M:%S')}")
        self.item_to_detect = random.choice(self.POSSIBLE_OPTIONS)
        self.logger.info(f"Item to detect: {self.item_to_detect}")

    async def _handle_game_end(self):
        if self.time_round_start:  # Only log if there was an active game
            self.logger.info(f"Round over at {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
            self.logger.info(f"Final Score: {self.score}")
            self.time_round_start = None
            self.item_to_detect = ""

    async def push(
        self,
        *,
        extra: Optional[Mapping[str, Any]] = None,
        timeout: Optional[float] = None,
        **kwargs
    ) -> None:
        self.logger.info("`push` is called")
        self.new_game = True

    async def do_command(
        self,
        command: Mapping[str, ValueTypes],
        *,
        timeout: Optional[float] = None,
        **kwargs
    ) -> Mapping[str, ValueTypes]:
        result = {}
        for name, args in command.items():
            if name == "action" and args == "get_data":
                result["score"] = self.score
                result["time_round_start"] = str(self.time_round_start)
                result["item_to_detect"] = self.item_to_detect
                return result
        return {}

    async def get_geometries(
        self, *, extra: Optional[Dict[str, Any]] = None, timeout: Optional[float] = None
    ) -> Sequence[Geometry]:
        self.logger.error("`get_geometries` is not implemented")
        raise NotImplementedError()


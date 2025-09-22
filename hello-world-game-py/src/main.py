import asyncio
from viam.module.module import Module
try:
    from models.game_logic import GameLogic
except ModuleNotFoundError:
    # when running as local module with run.sh
    from .models.game_logic import GameLogic


if __name__ == '__main__':
    asyncio.run(Module.run_from_registry())

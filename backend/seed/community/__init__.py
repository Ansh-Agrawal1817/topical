"""The demo community's posts and threads, gathered from the topic files."""

from .general import POSTS as _GENERAL
from .teaching import POSTS as _TEACHING
from .technical import POSTS as _TECHNICAL

ALL_POSTS = [*_TEACHING, *_TECHNICAL, *_GENERAL]

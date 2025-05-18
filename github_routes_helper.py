# Helper function for file extensions
def get_file_extension(language):
    """Get the appropriate file extension for a language."""
    language = language.lower()  # Normalize to lowercase
    extension_map = {
        "python": ".py",
        "javascript": ".js",
        "typescript": ".ts",
        "java": ".java",
        "c": ".c",
        "cpp": ".cpp",
        "c++": ".cpp",
        "csharp": ".cs",
        "go": ".go",
        "ruby": ".rb",
        "rust": ".rs",
        "php": ".php",
        "swift": ".swift",
        "kotlin": ".kt",
        "dart": ".dart",
        "scala": ".scala",
        "perl": ".pl",
        "r": ".r",
        "bash": ".sh",
        "lua": ".lua",
        "haskell": ".hs",
        "html": ".html",
        "css": ".css",
    }
    # Special case handling for C++ variants
    if language in ["c++", "cpp"]:
        return ".cpp"
    return extension_map.get(language, ".txt")
